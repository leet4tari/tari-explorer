// Copyright 2022 The Tari Project
// SPDX-License-Identifier: BSD-3-Clause

var { createClient } = require("../baseNodeClient");
const { miningStats } = require("../utils/stats");

var express = require("express");
const cacheSettings = require("../cacheSettings");
const cache = require("../cache");
var router = express.Router();

/* GET home page. */
router.get("/", async function (req, res) {
  res.setHeader("Cache-Control", cacheSettings.index);
  try {
    let client = createClient();
    let from = parseInt(req.query.from || 0);
    let limit = parseInt(req.query.limit || "20");

    let version_result = await client.getVersion({});
    let version = version_result.value.slice(0, 25);

    let tipInfo = await client.getTipInfo({});

    // Algo split
    let resp = await client.listHeaders({
      from_height: 0,
      num_headers: 101,
    });
    let last100Headers = resp.map((r) => r.header);
    let monero = [0, 0, 0, 0];
    let sha = [0, 0, 0, 0];

    for (let i = 0; i < last100Headers.length - 1; i++) {
      let arr = last100Headers[i].pow.pow_algo === "0" ? monero : sha;
      if (i < 10) {
        arr[0] += 1;
      }
      if (i < 20) {
        arr[1] += 1;
      }
      if (i < 50) {
        arr[2] += 1;
      }
      arr[3] += 1;
    }
    const algoSplit = {
      monero10: monero[0],
      monero20: monero[1],
      monero50: monero[2],
      monero100: monero[3],
      sha10: sha[0],
      sha20: sha[1],
      sha50: sha[2],
      sha100: sha[3],
    };

    // Get one more header than requested so we can work out the difference in MMR_size
    let headersResp = await client.listHeaders({
      from_height: from,
      num_headers: limit + 1,
    });
    let headers = headersResp.map((r) => r.header);
    const pows = { 0: "Monero", 1: "SHA-3" };
    for (var i = headers.length - 2; i >= 0; i--) {
      headers[i].kernels =
        headers[i].kernel_mmr_size - headers[i + 1].kernel_mmr_size;
      headers[i].outputs =
        headers[i].output_mmr_size - headers[i + 1].output_mmr_size;
      headers[i].powText = pows[headers[i].pow.pow_algo];
    }
    let lastHeader = headers[headers.length - 1];
    if (lastHeader.height === "0") {
      // If the block is the genesis block, then the MMR sizes are the values to use
      lastHeader.kernels = lastHeader.kernel_mmr_size;
      lastHeader.outputs = lastHeader.output_mmr_size;
    } else {
      // Otherwise remove the last one, as we don't want to show it
      headers.splice(headers.length - 1, 1);
    }

    let firstHeight = parseInt(headers[0].height || "0");

    // --  mempool
    let mempool = await client.getMempoolTransactions({});

    // estimated hash rates
    let lastDifficulties = await client.getNetworkDifficulty({ from_tip: 180 });
    let totalHashRates = getHashRates(lastDifficulties, [
      "estimated_hash_rate",
    ]);
    let moneroHashRates = getHashRates(lastDifficulties, [
      "monero_estimated_hash_rate",
      "randomx_estimated_hash_rate",
    ]);
    let shaHashRates = getHashRates(lastDifficulties, [
      "sha3_estimated_hash_rate",
      "sha3x_estimated_hash_rate",
    ]);

    // list of active validator nodes
    let tipHeight = tipInfo.metadata.best_block_height;
    let activeVns = await client.getActiveValidatorNodes({
      height: tipHeight,
    });

    for (let i = 0; i < mempool.length; i++) {
      let sum = 0;
      for (let j = 0; j < mempool[i].transaction.body.kernels.length; j++) {
        sum += parseInt(mempool[i].transaction.body.kernels[j].fee);
        mempool[i].transaction.body.signature =
          mempool[i].transaction.body.kernels[j].excess_sig.signature;
      }
      mempool[i].transaction.body.total_fees = sum;
    }


    let request = { heights: [tipHeight] };
    let block = await cache.get(client.getBlocks, request);
    if (!block || block.length === 0) {
      res.status(404);
      res.render("404", { message: `Block at height ${height} not found` });
      return;
    }

    // Calculate statistics
    const { totalCoinbaseXtm, numCoinbases, numOutputsNoCoinbases, numInputs } =
      miningStats(block);

    const json = {
      title: "Blocks",
      version,
      tipInfo,
      mempool,
      headers,
      pows,
      nextPage: firstHeight - limit,
      prevPage: firstHeight + limit,
      limit,
      from,
      algoSplit,
      blockTimes: getBlockTimes(last100Headers, null, 2),
      moneroTimes: getBlockTimes(last100Headers, "0", 4),
      shaTimes: getBlockTimes(last100Headers, "1", 4),
      currentHashRate: totalHashRates[totalHashRates.length - 1],
      totalHashRates,
      currentShaHashRate: shaHashRates[shaHashRates.length - 1],
      shaHashRates,
      averageShaMiners: shaHashRates[shaHashRates.length - 1] / 200_000_000, // Hashrate of an NVidia 1070
      currentMoneroHashRate: moneroHashRates[moneroHashRates.length - 1],
      averageMoneroMiners: moneroHashRates[moneroHashRates.length - 1] / 2700, // Average apple m1 hashrate
      moneroHashRates,
      activeVns,
      numInputs,
      totalCoinbaseXtm,
      numCoinbases,
      numOutputsNoCoinbases,
    };
    if (req.query.json !== undefined) {
      res.json(json);
    } else {
      res.render("index", json);
    }
  } catch (error) {
    res.status(500);
    if (req.query.json !== undefined) {
      res.json({ error: error });
    } else {
      res.render("error", { error: error });
    }
  }
});

function getHashRates(difficulties, properties) {
  const end_idx = difficulties.length - 1;
  const start_idx = end_idx - 720;

  return difficulties
    .map((d) =>
      properties.reduce(
        (sum, property) => sum + (parseInt(d[property]) || 0),
        0,
      ),
    )
    .slice(start_idx, end_idx);
}

function getBlockTimes(last100Headers, algo, targetTime) {
  let blocktimes = [];
  let i = 0;
  if (algo === "0" || algo === "1") {
    while (
      i < last100Headers.length &&
      last100Headers[i].pow.pow_algo !== algo
    ) {
      i++;
      blocktimes.push(0);
    }
  }
  if (i >= last100Headers.length) {
    // This happens if there are no blocks for a specific algorithm in last100headers
    return blocktimes;
  }
  let lastBlockTime = parseInt(last100Headers[i].timestamp);
  i++;
  while (i < last100Headers.length && blocktimes.length < 60) {
    if (!algo || last100Headers[i].pow.pow_algo === algo) {
      blocktimes.push(
        (lastBlockTime - parseInt(last100Headers[i].timestamp)) / 60 -
          targetTime,
      );
      lastBlockTime = parseInt(last100Headers[i].timestamp);
    } else {
      blocktimes.push(targetTime);
    }
    i++;
  }
  return blocktimes;
}

module.exports = router;
