import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  TOKEN_PROGRAM_ID,
  getAccount,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

import { Account, createMint } from "spl-token-bankrun";

import { assert, expect } from "chai";
import { BankrunProvider } from "anchor-bankrun";
import {
  BanksClient,
  ProgramTestContext,
  startAnchor,
  Clock,
} from "solana-bankrun";

import IDL from "../target/idl/aixblock.json";
import { Aixblock } from "../target/types/aixblock";

describe("aixblock", () => {
  const TOKEN_SUPPLY = 10_000;
  const FAIRNESS_THRESHOLD = 500;
  const UNLOCK_SLOT = 6_480_000;

  const contributorOnePoints = new anchor.BN(400);
  const contributorTwoPoints = new anchor.BN(600);

  let banksClient: BanksClient;
  let context: ProgramTestContext;

  const web3 = anchor.web3;

  let provider: BankrunProvider;

  let program: Program<Aixblock>;

  let adminKeypair: anchor.web3.Keypair;
  let contributorOne: anchor.web3.Keypair = web3.Keypair.generate();
  let contributorTwo: anchor.web3.Keypair = web3.Keypair.generate();

  let tokenMint: anchor.web3.PublicKey;
  let statePDA: anchor.web3.PublicKey;

  let contributorPDA1: anchor.web3.PublicKey;
  let contributorPDA2: anchor.web3.PublicKey;

  let tokenPoolAccount: anchor.web3.PublicKey;
  let ecosystemFundAccount: anchor.web3.PublicKey;

  let contributorOneATA: Account;
  let contributorTwoATA: Account;

  before(async () => {
    context = await startAnchor(
      "",
      [
        {
          name: "aixblock",
          programId: new web3.PublicKey(IDL.address),
        },
      ],
      []
    );

    provider = new BankrunProvider(context);

    anchor.setProvider(provider);

    program = new Program(IDL as Aixblock, provider);

    banksClient = context.banksClient;

    adminKeypair = provider.wallet.payer;

    console.log(
      `\n[Setup] Admin Public Key: ${adminKeypair.publicKey.toBase58()}`
    );
    console.log(
      `[Setup] Contributor One Public Key: ${contributorOne.publicKey.toBase58()}`
    );
    console.log(
      `[Setup] Contributor Two Public Key: ${contributorTwo.publicKey.toBase58()}`
    );

    const transferTx = new web3.Transaction().add(
      web3.SystemProgram.transfer({
        fromPubkey: adminKeypair.publicKey,
        toPubkey: contributorOne.publicKey,
        lamports: web3.LAMPORTS_PER_SOL,
      }),
      web3.SystemProgram.transfer({
        fromPubkey: adminKeypair.publicKey,
        toPubkey: contributorTwo.publicKey,
        lamports: web3.LAMPORTS_PER_SOL,
      })
    );

    await provider.sendAndConfirm(transferTx, [adminKeypair]);
    console.log(`[Setup] Transferred lamports to both contributors`);

    tokenMint = await createMint(
      banksClient,
      adminKeypair,
      adminKeypair.publicKey,
      null,
      6
    );
    console.log(`[Setup] Token Mint Address: ${tokenMint}`);

    // Derive PDAs
    [statePDA] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("program_state")],
      program.programId
    );
    console.log(`[Setup] Program State PDA: ${statePDA}`);

    [contributorPDA1] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("contributor"), Buffer.from("1")],
      program.programId
    );
    console.log(`[Setup] Contributor One PDA: ${contributorPDA1}`);

    [contributorPDA2] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("contributor"), Buffer.from("2")],
      program.programId
    );
    console.log(`[Setup] Contributor Two PDA: ${contributorPDA2}`);

    [tokenPoolAccount] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("token_pool")],
      program.programId
    );
    console.log(`[Setup] Token Pool Account PDA: ${tokenPoolAccount}`);

    [ecosystemFundAccount] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("ecosystem_reserve")],
      program.programId
    );
    console.log(`[Setup] Ecosystem Fund PDA: ${ecosystemFundAccount}`);

    // Create Associated Token Accounts for contributors
    contributorOneATA = getAssociatedTokenAddressSync(
      tokenMint,
      contributorOne.publicKey
    );

    console.log(`[Setup] Contributor One ATA: ${contributorOneATA}`);

    contributorTwoATA = getAssociatedTokenAddressSync(
      tokenMint,
      contributorTwo.publicKey
    );

    console.log(`[Setup] Contributor One ATA: ${contributorTwo}`);
  });

  it("Initializes the program state successfully", async () => {
    console.log("\n[Test] Initializing program state...");

    const tx = await program.methods
      .initializeProgramState()
      .accountsPartial({
        signer: adminKeypair.publicKey,
        tokenPoolMint: tokenMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([adminKeypair])
      .rpc();
    console.log(`[Test] Initialize State Transaction Hash: ${tx}`);

    const stateAccount = await program.account.state.fetch(
      statePDA,
      "confirmed"
    );

    assert.ok(
      stateAccount.admin.equals(adminKeypair.publicKey),
      "Admin public key does not match"
    );
    assert.ok(
      stateAccount.tokenPoolAccount.equals(web3.PublicKey.default),
      "Token Pool Account should be default"
    );
    assert.ok(
      stateAccount.ecosystemReserveAccount.equals(ecosystemFundAccount),
      "Ecosystem fund address does not match"
    );
    assert.ok(
      stateAccount.globalContributionPoints.eq(new anchor.BN(0)),
      "Global contribution points should be zero"
    );
    assert.ok(
      stateAccount.tokenPoolMint.equals(tokenMint),
      "Token mint address does not match"
    );
  });

  it("Unlocks funds after the required time has passed", async () => {
    console.log("\n[Test] Unlocking funds after time requirement...");
    let balance = await banksClient.getBalance(tokenPoolAccount);
    assert.equal(balance, BigInt(0), "Expected token pool balance to be 0");

    const tx = await program.methods
      .unlockTokens()
      .accountsPartial({
        admin: adminKeypair.publicKey,
        state: statePDA,
        tokenPoolMint: tokenMint,
        tokenPoolAccount: tokenPoolAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([adminKeypair])
      .rpc();
    console.log(`[Test] UnlockTokens Transaction Hash: ${tx}`);

    balance = await banksClient.getBalance(tokenPoolAccount);
    assert.notEqual(balance, BigInt(0), "Token pool balance did not change");

    const stateAccount = await program.account.state.fetch(statePDA);
    assert.notEqual(
      stateAccount.tokenPoolAccountBump,
      0,
      "Token pool bump value is 0"
    );
    assert.ok(
      stateAccount.tokenPoolAccount.equals(tokenPoolAccount),
      "Token pool account PDA does not match"
    );
  });

  it("Should Fail Unlocks funds before the required time has passed", async () => {
    console.log("\n[Test] Unlocking funds before time requirement...");
    let balanceBefore = await banksClient.getBalance(tokenPoolAccount);
    assert.notEqual(
      balanceBefore,
      BigInt(0),
      "Excepted balance not be equal to zero"
    );

    try {
      await program.methods
        .unlockTokens()
        .accountsPartial({
          admin: adminKeypair.publicKey,
          state: statePDA,
          tokenPoolMint: tokenMint,
          tokenPoolAccount: tokenPoolAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([adminKeypair])
        .rpc();
      assert.fail(
        "Should not be able to unlock tokens before the eligible time"
      );
    } catch (err) {
      console.log(`[Test] Error: ${err.toString()}`);
      assert(
        err.toString().includes("EarlyUnlock"),
        `Expected error to contain "EarlyUnlock" but got: ${err}`
      );
    }
    let balanceAfter = await banksClient.getBalance(tokenPoolAccount);
    assert.equal(balanceBefore, balanceAfter, "Excepted balance to be equal");
  });

  it("Creates a contributor account successfully", async () => {
    console.log("\n[Test] Creating Contributor One account...");
    await program.methods
      .createContributorAccount("1")
      .accountsPartial({
        signer: contributorOne.publicKey,
        tokenPoolMint: tokenMint,
        state: statePDA,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([contributorOne])
      .rpc();

    let contributorData1 = await program.account.contribution.fetch(
      contributorPDA1
    );

    assert.ok(
      contributorData1.contributorAddress.equals(contributorOne.publicKey),
      "Contributor one address mismatch"
    );
    assert.ok(
      contributorData1.accumulatedPoints.eq(new anchor.BN(0)),
      "Initial accumulated points should be zero"
    );
    assert.ok(
      contributorData1.tokenPoolAccount.equals(contributorOneATA),
      "Contributor One token pool account mismatch"
    );
    console.log("\n[Test] Creating Contributor Two account...");
    await program.methods
      .createContributorAccount("2")
      .accountsPartial({
        signer: contributorTwo.publicKey,
        tokenPoolMint: tokenMint,
        state: statePDA,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([contributorTwo])
      .rpc();

    let contributorData2 = await program.account.contribution.fetch(
      contributorPDA2
    );
    console.log(
      `[Test] Fetched contributor PDA for contributor "2" again for verification`
    );
    assert.ok(
      contributorData2.contributorAddress.equals(contributorTwo.publicKey),
      "Contributor Two address mismatch for contributorAddress"
    );
    assert.ok(
      contributorData2.accumulatedPoints.eq(new anchor.BN(0)),
      "Contributor Two accumulated points should still be zero"
    );
    assert.ok(
      contributorData2.tokenPoolAccount.equals(contributorTwoATA),
      "Contributor Two token pool account mismatch"
    );
  });

  it("Logs contributor points", async () => {
    console.log("\n[Test] Logging points for Contributor One...");
    let contributorData = await program.account.contribution.fetch(
      contributorPDA1
    );
    let stateData = await program.account.state.fetch(statePDA);
    const expectedGlobalPoints =
      stateData.globalContributionPoints.add(contributorOnePoints);
    assert.ok(
      contributorData.accumulatedPoints.eq(new anchor.BN(0)),
      "Contributor should initially have zero points"
    );

    const tx = await program.methods
      .logContributorPoints("1", contributorOnePoints)
      .accountsPartial({
        authority: adminKeypair.publicKey,
        state: statePDA,
        contributor: contributorPDA1,
      })
      .signers([adminKeypair])
      .rpc();
    console.log(`[Test] Log Contributor Points Transaction Hash: ${tx}`);

    contributorData = await program.account.contribution.fetch(contributorPDA1);
    stateData = await program.account.state.fetch(statePDA);

    assert.ok(
      stateData.globalContributionPoints.eq(expectedGlobalPoints),
      "Global contribution points did not update correctly"
    );
    assert.ok(
      contributorData.accumulatedPoints.eq(contributorOnePoints),
      "Contributor One's points did not update correctly"
    );

    console.log();
  });

  it("Fails to log contributor points when unauthorized", async () => {
    console.log(
      "\n[Test] Attempting to log contributor points with unauthorized user..."
    );
    try {
      await program.methods
        .logContributorPoints("1", new anchor.BN(5))
        .accountsPartial({
          authority: contributorOne.publicKey,
          state: statePDA,
          contributor: contributorPDA1,
        })
        .signers([contributorOne])
        .rpc();
      assert.fail("Unauthorized user should not be able to log points");
    } catch (err) {
      assert(
        err.toString().includes("Unauthorized"),
        `Expected error to contain "Unauthorized" but got: ${err}`
      );
      console.log(
        `[Test] Caught expected Unauthorized error: ${err.toString()}`
      );
    }
  });

  it("Fails to claim tokens before the eligible time", async () => {
    console.log(
      "\n[Test] Attempting to claim tokens before eligible time for Contributor One..."
    );
    try {
      await program.methods
        .claimContributorTokens("1")
        .accountsPartial({
          signer: contributorOne.publicKey,
          tokenPoolMint: tokenMint,
          state: statePDA,
          tokenPoolAccount: tokenPoolAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([contributorOne])
        .rpc();
      assert.fail(
        "Should not be able to claim tokens before the eligible time"
      );
    } catch (err) {
      assert(
        err.toString().includes("EarlyTokenClaim"),
        `Expected error to contain "Early Claim" but got: ${err}`
      );
      console.log(
        `[Test] Caught expected Early Claim error: ${err.toString()}`
      );
    }
  });

  it("Allows a contributor to claim tokens after eligibility", async () => {
    const currentClock = await banksClient.getClock();

    context.setClock(
      new Clock(
        currentClock.slot + BigInt(UNLOCK_SLOT),
        currentClock.epochStartTimestamp,
        currentClock.epoch,
        currentClock.leaderScheduleEpoch,
        currentClock.unixTimestamp + BigInt(30 * 24 * 60 * 60)
      )
    );
    const stateDataAccount = await program.account.state.fetch(statePDA);
    console.log(stateDataAccount.globalContributionPoints);

    const contributor1AccountBefore = await program.account.contribution.fetch(
      contributorPDA1
    );

    assert.notEqual(
      contributor1AccountBefore.accumulatedPoints.toNumber(),
      0,
      "Contributor's accumulated tokens should reset to 0 after claim."
    );

    const tx = await program.methods
      .claimContributorTokens("1")
      .accountsPartial({
        signer: contributorOne.publicKey,
        state: statePDA,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .transaction();

    tx.recentBlockhash = context.lastBlockhash;
    tx.sign(contributorOne);

    await context.banksClient.processTransaction(tx);

    const contributor1AccountAfter = await program.account.contribution.fetch(
      contributorPDA1
    );
    assert.strictEqual(
      contributor1AccountAfter.accumulatedPoints.toNumber(),
      0,
      "Contributor's accumulated tokens should reset to 0 after claim."
    );

    const tokenAccount = await getAccount(
      provider.connection,
      contributorOneATA
    );
    console.log("Contributor pool account balance:", tokenAccount.amount);
    assert(
      tokenAccount.amount > 0,
      "Contributor pool account should reflect the claimed tokens."
    );
  });

  it("should get an error for transferring funds before time", async () => {
    try {
      await program.methods
        .resetProgramState()
        .accountsPartial({
          signer: adminKeypair.publicKey,
          tokenPoolMint: tokenMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([adminKeypair])
        .rpc();
      assert.fail("Should not be able to reset program state before time");
    } catch (err) {
      assert(
        err.toString().includes("EarlyReset"),
        `Expected error to contain "EarlyReset" but got: ${err}`
      );
      console.log(`[Test] Caught expected EarlyReset error: ${err.toString()}`);
    }
  });

  it("should transfer funds to reserve after cooldown", async () => {
    const currentClock = await banksClient.getClock();

    const stateDataAccountBefore = await program.account.state.fetch(statePDA);

    assert.notStrictEqual(
      stateDataAccountBefore.globalContributionPoints.toNumber(),
      0,
      "Message..."
    );

    context.setClock(
      new Clock(
        currentClock.slot + BigInt(UNLOCK_SLOT),
        currentClock.epochStartTimestamp,
        currentClock.epoch,
        currentClock.leaderScheduleEpoch,
        currentClock.unixTimestamp + BigInt(30 * 24 * 60 * 60)
      )
    );
    const futureBanksClient = context.banksClient;
    const tx = await program.methods
      .resetProgramState()
      .accountsPartial({
        signer: adminKeypair.publicKey,
        tokenPoolMint: tokenMint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .transaction();
    tx.recentBlockhash = context.lastBlockhash;
    tx.sign(adminKeypair);

    await futureBanksClient.processTransaction(tx);

    const stateDataAccountAfter = await program.account.state.fetch(statePDA);

    assert.strictEqual(
      stateDataAccountAfter.globalContributionPoints.toNumber(),
      0,
      "Message..."
    );
  });
});
