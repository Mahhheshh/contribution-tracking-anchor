import dotenv from "dotenv";
import { App } from "octokit";
import { createNodeMiddleware } from "@octokit/webhooks";
import fs from "fs";
import http from "http";

import * as anchor from "@coral-xyz/anchor";
import type { Program } from "@coral-xyz/anchor";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import type { Aixblock } from "../target/types/aixblock";
import IDL from "../target/idl/aixblock.json";

import { getSimulationComputeUnits } from "@solana-developers/helpers";

dotenv.config();

const env = {
  RPC_URL: process.env.RPC_URL,
  WALLET_KEY: process.env.WALLET_KEY
    ? JSON.parse(process.env.WALLET_KEY)
    : null,
  APP_ID: process.env.APP_ID,
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET,
  PRIVATE_KEY_PATH: process.env.PRIVATE_KEY_PATH,
};

if (
  !env.RPC_URL ||
  !env.WALLET_KEY ||
  !env.APP_ID ||
  !env.WEBHOOK_SECRET ||
  !env.PRIVATE_KEY_PATH
) {
  throw new Error("Missing required environment variables");
}

const connection = new anchor.web3.Connection(env.RPC_URL);
const walletKeyPair = anchor.web3.Keypair.fromSecretKey(
  new Uint8Array(env.WALLET_KEY)
);

const provider = new anchor.AnchorProvider(
  connection,
  new NodeWallet(walletKeyPair) as anchor.Wallet,
  {}
);

const program = new anchor.Program(
  IDL as anchor.Idl,
  provider
) as unknown as Program<Aixblock>;

const privateKey = fs.readFileSync(env.PRIVATE_KEY_PATH, "utf8");

const app = new App({
  appId: env.APP_ID,
  privateKey,
  webhooks: { secret: env.WEBHOOK_SECRET },
});

interface PullRequestPayload {
  action: string;
  repository: {
    owner: { login: string };
    name: string;
  };
  pull_request: {
    number: number;
    user: { login: string };
    merged?: boolean;
  };
  [key: string]: any;
}

const [statePDA] = anchor.web3.PublicKey.findProgramAddressSync(
  [Buffer.from("program_state")],
  program.programId
);

async function buildOptimalTransaction(
  connection: anchor.web3.Connection,
  instructions: Array<anchor.web3.TransactionInstruction>,
  signer: anchor.web3.Signer,
  lookupTables: Array<anchor.web3.AddressLookupTableAccount>
) {
  const [microLamports, units, recentBlockhash] = await Promise.all([
    500,
    getSimulationComputeUnits(
      connection,
      instructions,
      signer.publicKey,
      lookupTables
    ),
    connection.getLatestBlockhash(),
  ]);

  instructions.unshift(
    anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports })
  );
  if (units) {
    instructions.unshift(
      anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({ units })
    );
  }
  return {
    transaction: new anchor.web3.VersionedTransaction(
      new anchor.web3.TransactionMessage({
        instructions,
        recentBlockhash: recentBlockhash.blockhash,
        payerKey: signer.publicKey,
      }).compileToV0Message(lookupTables)
    ),
    recentBlockhash,
  };
}

function getContributorAccount(username: string): anchor.web3.PublicKey {
  const [pda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("contributor"), Buffer.from(username)],
    program.programId
  );
  return pda;
}

async function handlePullRequestOpened({
  octokit,
  payload,
}: {
  octokit: any;
  payload: PullRequestPayload;
}) {
  const { repository, pull_request } = payload;
  const contributorLogin = pull_request.user.login;

  try {
    const contributorAccount = getContributorAccount(contributorLogin);

    const account = await program.account.contribution.fetchNullable(
      contributorAccount
    );
    if (account) {
      return;
    }
    // TODO: create a create account action
    const onboardingMessage = `
      👋 Welcome @${contributorLogin}! 
      It looks like this is your first contribution. Before we can merge your PR, please:
      Once completed, your points will be automatically tracked on-chain! 🚀`;

    await octokit.rest.issues.createComment({
      owner: repository.owner.login,
      repo: repository.name,
      issue_number: pull_request.number,
      body: onboardingMessage,
    });
  } catch (error) {
    console.error(
      `Error handling PR opened event: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

async function handlePullRequestClosed({
  octokit,
  payload,
}: {
  octokit: any;
  payload: PullRequestPayload;
}) {
  if (!payload.pull_request.merged) return;

  const contributorLogin = payload.pull_request.user.login;

  try {
    const contributorAccount = getContributorAccount(contributorLogin);
    // TODO: calculate points here
    const points = new anchor.BN(1);
    const instruction = await program.methods
      .logContributorPoints(contributorLogin, points)
      .accountsPartial({
        state: statePDA,
        authority: provider.wallet.publicKey,
        contributor: contributorAccount,
      })
      .instruction();

    const { transaction } = await buildOptimalTransaction(
      connection,
      [instruction],
      walletKeyPair,
      []
    );

    await provider.sendAndConfirm(transaction);
  } catch (error) {
    console.error(
      `Error processing contribution: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

app.webhooks.on("pull_request.opened", handlePullRequestOpened);
app.webhooks.on("pull_request.closed", handlePullRequestClosed);

app.webhooks.onError((error) => {
  console.log(`webhook errror: ${error}`);
});

const port = 3000;
const host = "localhost";
const path = "/api/webhook";

http
  .createServer(createNodeMiddleware(app.webhooks, { path }))
  .listen(port, () => {
    console.log(`Server listening on http://${host}:${port}${path}`);
  });
