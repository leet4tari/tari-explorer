// Copyright 2022 The Tari Project
// SPDX-License-Identifier: BSD-3-Clause

const createError = require("http-errors");
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const asciichart = require("asciichart");
const cors = require("cors");

var favicon = require("serve-favicon");
var indexRouter = require("./routes/index");
var blockDataRouter = require("./routes/block_data");
var blocksRouter = require("./routes/blocks");
var mempoolRouter = require("./routes/mempool");
var minersRouter = require("./routes/miners");
var searchCommitmentsRouter = require("./routes/search_commitments");
var searchKernelsRouter = require("./routes/search_kernels");
var healthz = require("./routes/healthz");
var statsRouter = require("./routes/stats");


var assetsRouter = require("./routes/assets");

var hbs = require("hbs");
const [hex, script] = require("./script");
hbs.registerHelper("hex", hex);
hbs.registerHelper("script", script);

hbs.registerHelper("json", function (obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
});

hbs.registerHelper("timestamp", function (timestamp) {
  var dateObj = new Date(timestamp * 1000);
  const day = dateObj.getUTCDate();
  const month = dateObj.getUTCMonth() + 1;
  const year = dateObj.getUTCFullYear();
  const hours = dateObj.getUTCHours();
  const minutes = dateObj.getUTCMinutes();
  const seconds = dateObj.getSeconds();

  return (
    year.toString() +
    "-" +
    month.toString().padStart(2, "0") +
    "-" +
    day.toString().padStart(2, "0") +
    " " +
    hours.toString().padStart(2, "0") +
    ":" +
    minutes.toString().padStart(2, "0") +
    ":" +
    seconds.toString().padStart(2, "0")
  );
});

hbs.registerHelper("percentbar", function (a, b) {
  var percent = (a / (a + b)) * 100;
  var barWidth = percent / 10;
  var bar = "**********".slice(0, barWidth);
  var space = "...........".slice(0, 10 - barWidth);
  return bar + space + " " + parseInt(percent) + "% ";
});

hbs.registerHelper("chart", function (data, height) {
  if (data.length > 0) {
    return asciichart.plot(data, {
      height: height,
    });
  } else {
    return "**No data**";
  }
});

hbs.registerHelper("json", function (obj) {
  return JSON.stringify(obj);
});
hbs.registerHelper("add", function (a, b) {
  return a + b;
});

hbs.registerPartials(path.join(__dirname, "partials"));

var app = express();

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "hbs");

app.use(favicon(path.join(__dirname, "public", "favicon.ico")));
app.use(logger("dev"));
app.use(express.json());
app.use(
  express.urlencoded({
    extended: false,
  }),
);
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use(cors());

app.use("/", indexRouter);
app.use("/blocks", blocksRouter);
app.use("/block_data", blockDataRouter);
app.use("/assets", assetsRouter);
// app.use("/export", exportRouter);
app.use("/mempool", mempoolRouter);
app.use("/miners", minersRouter);
app.use("/search_commitments", searchCommitmentsRouter);
app.use("/search_kernels", searchKernelsRouter);
app.use("/healthz", healthz);
app.use("/stats", statsRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

module.exports = app;
