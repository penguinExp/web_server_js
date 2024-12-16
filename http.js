"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
    function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
exports.__esModule = true;
var net = require("net");
// the maximum length of an HTTP header
var kMaxHeaderLen = 1024 * 8;
var HTTPError = /** @class */ (function (_super) {
    __extends(HTTPError, _super);
    function HTTPError(statusCode, message) {
        var _this = _super.call(this, message) || this;
        _this.statusCode = statusCode;
        _this.name = "HTTPError";
        return _this;
    }
    return HTTPError;
}(Error));
// creates a wrapper from net.Socket
function soInit(socket) {
    var conn = {
        socket: socket,
        reader: null,
        ended: false,
        err: null
    };
    socket.on("data", function (data) {
        console.assert(conn.reader);
        // pause the 'data' event until the next read
        conn.socket.pause();
        // fulfill the promise of the current read
        conn.reader.resolve(data);
        conn.reader = null;
    });
    // this also fulfills the current read
    socket.on("end", function () {
        conn.ended = true;
        if (conn.reader) {
            conn.reader.resolve(Buffer.from(""));
            conn.reader = null;
        }
    });
    socket.on("error", function (err) {
        conn.err = err;
        if (conn.reader) {
            conn.reader.reject(err);
            conn.reader = null;
        }
    });
    return conn;
}
// returns an empty `Buffer` after EOF
function soRead(conn) {
    // reader should be null, so we can avoid concurrent calls
    console.assert(!conn.reader);
    return new Promise(function (resolve, reject) {
        // if the connection is not readable, complete the promise
        if (conn.err) {
            reject(conn.err);
            return;
        }
        if (conn.ended) {
            resolve(Buffer.from("")); // EOF
            return;
        }
        // save the promise callbacks
        conn.reader = { reject: reject, resolve: resolve };
        // the 'data' callback of the socket pauses after reading
        // resume the 'data' event to fulfill the promise later
        conn.socket.resume();
    });
}
function soWrite(conn, data) {
    console.assert(data.length > 0);
    return new Promise(function (resolve, reject) {
        if (conn.err) {
            reject(conn.err);
            return;
        }
        conn.socket.write(data, function (err) {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    });
}
// append data to DynBuffer
function bufPush(buf, data) {
    var newLen = buf.length + data.length;
    if (buf.data.length < newLen) {
        // grow the capacity by the power if two
        var cap = Math.max(buf.data.length, 32);
        while (cap < newLen) {
            cap *= 2;
        }
        var grown = Buffer.alloc(cap);
        buf.data.copy(grown, 0, 0);
        buf.data = grown;
    }
    data.copy(buf.data, buf.length, 0);
    buf.length = newLen;
}
// remove the data from the front
function bufPop(buf, len) {
    buf.data.copyWithin(0, len, buf.length);
    buf.length -= len;
}
// parse & remove a header from the beginning of the buffer if possible
function cutMessage(buf) {
    // the end of the header is marked by '\r\n\r\n'
    var idx = buf.data.subarray(0, buf.length).indexOf("\r\n\r\n");
    if (idx < 0) {
        if (buf.length >= kMaxHeaderLen) {
            throw new HTTPError(413, "header is too large");
        }
        return null; // need more data
    }
    // parse & remove the header
    var msg = parseHTTPReq(buf.data.subarray(0, idx + 4));
    bufPop(buf, idx + 4);
    return msg;
}
function splitLines(data) {
    var lines = [];
    var start = 0;
    for (var i = 0; i < data.length; i++) {
        // Look for line endings (CRLF or LF)
        if (data[i] === 0x0a) {
            // LF
            var end = i > 0 && data[i - 1] === 0x0d ? i - 1 : i; // Handle CRLF (\r\n)
            lines.push(data.slice(start, end));
            start = i + 1; // Move to the next line
        }
    }
    // Handle any remaining data
    if (start < data.length) {
        lines.push(data.slice(start));
    }
    return lines;
}
function parseDec(input) {
    var trimmed = input.trim();
    // Ensure the string contains only digits
    if (!/^\d+$/.test(trimmed)) {
        return NaN; // Return NaN if invalid
    }
    return parseInt(trimmed, 10);
}
function fieldGet(headers, fieldName) {
    var lowerFieldName = fieldName.toLowerCase();
    for (var _i = 0, headers_1 = headers; _i < headers_1.length; _i++) {
        var header = headers_1[_i];
        var headerStr = header.toString("latin1");
        var separatorIndex = headerStr.indexOf(":");
        if (separatorIndex > 0) {
            var name_1 = headerStr.slice(0, separatorIndex).trim();
            // Check if the header name matches (case-insensitive)
            if (name_1.toLowerCase() === lowerFieldName) {
                var value = headerStr.slice(separatorIndex + 1).trim();
                return Buffer.from(value, "latin1");
            }
        }
    }
    return null; // Return null if the field is not found
}
function parseRequestLine(line) {
    var lineStr = line.toString().trim();
    var parts = lineStr.split(" ");
    if (parts.length !== 3) {
        throw new HTTPError(400, "Invalid request line");
    }
    var method = parts[0], uri = parts[1], version = parts[2];
    // Validate HTTP version
    if (!/^HTTP\/\d\.\d$/.test(version)) {
        throw new HTTPError(400, "Invalid HTTP version");
    }
    return [method, uri, version];
}
function encodeHTTPResp(resp) {
    // Construct the status line: `HTTP/1.1 <code> <reasonPhrase>`
    var reasonPhrase = getReasonPhrase(resp.code);
    var statusLine = "HTTP/1.1 ".concat(resp.code, " ").concat(reasonPhrase);
    // Serialize headers
    var headers = resp.headers
        .map(function (header) { return header.toString("latin1"); })
        .join("\r\n");
    // Combine the status line, headers, and end with an empty line
    var responseString = "".concat(statusLine, "\r\n").concat(headers, "\r\n\r\n");
    // Return the serialized response as a Buffer
    return Buffer.from(responseString, "latin1");
}
function getReasonPhrase(code) {
    var phrases = {
        200: "OK",
        201: "Created",
        204: "No Content",
        301: "Moved Permanently",
        302: "Found",
        400: "Bad Request",
        401: "Unauthorized",
        403: "Forbidden",
        404: "Not Found",
        500: "Internal Server Error",
        501: "Not Implemented",
        502: "Bad Gateway",
        503: "Service Unavailable"
    };
    return phrases[code] || "Unknown";
}
function validateHeader(header) {
    var headerStr = header.toString();
    var separatorIndex = headerStr.indexOf(":");
    // Ensure the header contains a `:` separator and has non-empty name/value
    if (separatorIndex <= 0 || separatorIndex === headerStr.length - 1) {
        return false;
    }
    var name = headerStr.slice(0, separatorIndex).trim();
    var value = headerStr.slice(separatorIndex + 1).trim();
    // Validate header name (RFC 7230 field-name rules)
    var nameRegex = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
    if (!nameRegex.test(name)) {
        return false;
    }
    // Value can contain any printable characters (or be empty after trimming)
    var valueRegex = /^[\t -~]*$/;
    if (!valueRegex.test(value)) {
        return false;
    }
    return true;
}
function readerFromGenerator(gen) {
    var _this = this;
    return {
        length: -1,
        read: function () { return __awaiter(_this, void 0, void 0, function () {
            var r;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, gen.next()];
                    case 1:
                        r = _a.sent();
                        if (r.done || !r.value) {
                            // Handle EOF or if the generator unexpectedly yields `undefined`
                            return [2 /*return*/, Buffer.from("")]; // EOF
                        }
                        else {
                            console.assert(r.value.length > 0); // `r.value` is guaranteed to be a Buffer
                            return [2 /*return*/, r.value];
                        }
                        return [2 /*return*/];
                }
            });
        }); }
    };
}
// count to 99
function countSheep() {
    return __asyncGenerator(this, arguments, function countSheep_1() {
        var i;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    i = 0;
                    _a.label = 1;
                case 1:
                    if (!(i < 100)) return [3 /*break*/, 6];
                    // sleep 1s, then output the counter
                    return [4 /*yield*/, __await(new Promise(function (resolve) { return setTimeout(resolve, 1000); }))];
                case 2:
                    // sleep 1s, then output the counter
                    _a.sent();
                    return [4 /*yield*/, __await(Buffer.from("".concat(i, "\n")))];
                case 3: return [4 /*yield*/, _a.sent()];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5:
                    i++;
                    return [3 /*break*/, 1];
                case 6: return [2 /*return*/];
            }
        });
    });
}
// parse an HTTP request header
function parseHTTPReq(data) {
    // split the data into lines
    var lines = splitLines(data);
    // the first line is `METHOD URI VERSION`
    var _a = parseRequestLine(lines[0]), method = _a[0], uri = _a[1], version = _a[2];
    // followed by header fields in the format of `Name: value'
    var headers = [];
    for (var i = 1; i < lines.length - 1; i++) {
        var h = Buffer.from(lines[i]); // copy
        if (!validateHeader(h)) {
            throw new HTTPError(400, "bad field");
        }
        headers.push(h);
    }
    // the header ends by an empty line
    console.assert(lines[lines.length - 1].length === 0);
    return {
        method: method,
        uri: Buffer.from(uri),
        version: version,
        headers: headers
    };
}
function bufExpectMore(conn, buf, context) {
    return __awaiter(this, void 0, void 0, function () {
        var newData;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, soRead(conn)];
                case 1:
                    newData = _a.sent();
                    if (!newData || newData.length === 0) {
                        throw new Error("Unexpected end of data while reading ".concat(context, "."));
                    }
                    buf.data = Buffer.concat([buf.data, newData]);
                    buf.length += newData.length;
                    return [2 /*return*/];
            }
        });
    });
}
function readChunks(conn, buf) {
    return __asyncGenerator(this, arguments, function readChunks_1() {
        var last, idx, sizeLine, remain, consume, data, crlf;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    last = false;
                    _a.label = 1;
                case 1:
                    if (!!last) return [3 /*break*/, 13];
                    idx = buf.data.subarray(0, buf.length).indexOf("\r\n");
                    if (!(idx < 0)) return [3 /*break*/, 3];
                    // Need more data if CRLF is not found
                    return [4 /*yield*/, __await(bufExpectMore(conn, buf, "chunk size"))];
                case 2:
                    // Need more data if CRLF is not found
                    _a.sent();
                    return [3 /*break*/, 12];
                case 3:
                    sizeLine = buf.data.subarray(0, idx).toString("latin1").trim();
                    remain = void 0;
                    try {
                        remain = parseInt(sizeLine, 16); // Parse hex chunk size
                        if (isNaN(remain) || remain < 0) {
                            throw new Error("Invalid chunk size.");
                        }
                    }
                    catch (err) {
                        throw new Error("Failed to parse chunk size: ".concat(sizeLine));
                    }
                    bufPop(buf, idx + 2); // Remove the chunk size line and CRLF
                    // Check if this is the last chunk
                    last = remain === 0;
                    _a.label = 4;
                case 4:
                    if (!(remain > 0)) return [3 /*break*/, 9];
                    if (!(buf.length === 0)) return [3 /*break*/, 6];
                    return [4 /*yield*/, __await(bufExpectMore(conn, buf, "chunk data"))];
                case 5:
                    _a.sent();
                    _a.label = 6;
                case 6:
                    consume = Math.min(remain, buf.length);
                    data = Buffer.from(buf.data.subarray(0, consume));
                    bufPop(buf, consume);
                    remain -= consume;
                    return [4 /*yield*/, __await(data)];
                case 7: return [4 /*yield*/, _a.sent()];
                case 8:
                    _a.sent();
                    return [3 /*break*/, 4];
                case 9:
                    if (!(buf.length < 2)) return [3 /*break*/, 11];
                    return [4 /*yield*/, __await(bufExpectMore(conn, buf, "CRLF after chunk data"))];
                case 10:
                    _a.sent();
                    _a.label = 11;
                case 11:
                    crlf = buf.data.subarray(0, 2).toString("latin1");
                    if (crlf !== "\r\n") {
                        throw new Error("Invalid chunk data termination (missing CRLF).");
                    }
                    bufPop(buf, 2); // Remove CRLF
                    _a.label = 12;
                case 12: return [3 /*break*/, 1];
                case 13: return [2 /*return*/];
            }
        });
    });
}
// BodyReader from an HTTP request
function readerFromReq(conn, buf, req) {
    var _a;
    var bodyLen = -1;
    var contentLen = fieldGet(req.headers, "Content-Length");
    if (contentLen) {
        bodyLen = parseDec(contentLen.toString("latin1"));
        if (isNaN(bodyLen)) {
            throw new HTTPError(400, "bad Content-Length.");
        }
    }
    var bodyAllowed = !(req.method === "GET" || req.method === "HEAD");
    var chunked = ((_a = fieldGet(req.headers, "Transfer-Encoding")) === null || _a === void 0 ? void 0 : _a.equals(Buffer.from("chunked"))) || false;
    if (!bodyAllowed && (bodyLen > 0 || chunked)) {
        throw new HTTPError(400, "HTTP body not allowed.");
    }
    if (!bodyAllowed) {
        bodyLen = 0;
    }
    if (bodyLen >= 0) {
        // "Content-Length" is present
        return readerFromConnLength(conn, buf, bodyLen);
    }
    else if (chunked) {
        // chunked encoding
        return readerFromGenerator(readChunks(conn, buf));
    }
    else {
        // read the rest of the connection
        // TODO: Do this
        // return readFromConnEOF(conn, buf);
        throw new HTTPError(501, "TODO");
    }
}
// BodyReader from a socket with a known length
function readerFromConnLength(conn, buf, remain) {
    var _this = this;
    return {
        length: remain,
        read: function () { return __awaiter(_this, void 0, void 0, function () {
            var data_1, consume, data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (remain === 0) {
                            return [2 /*return*/, Buffer.from("")]; // done
                        }
                        if (!(buf.length === 0)) return [3 /*break*/, 2];
                        return [4 /*yield*/, soRead(conn)];
                    case 1:
                        data_1 = _a.sent();
                        bufPush(buf, data_1);
                        if (data_1.length === 0) {
                            // expect more data!
                            throw new Error("Unexpected EOF from HTTP body");
                        }
                        _a.label = 2;
                    case 2:
                        consume = Math.min(buf.length, remain);
                        remain -= consume;
                        data = Buffer.from(buf.data.subarray(0, consume));
                        bufPop(buf, consume);
                        return [2 /*return*/, data];
                }
            });
        }); }
    };
}
// a sample request handler
function handleReq(req, body) {
    return __awaiter(this, void 0, void 0, function () {
        var resp;
        return __generator(this, function (_a) {
            switch (req.uri.toString("latin1")) {
                case "/echo":
                    // http echo server
                    resp = body;
                    break;
                case "/sheep":
                    resp = readerFromGenerator(countSheep());
                    break;
                default:
                    resp = readerFromMemory(Buffer.from("hello world.\n"));
                    break;
            }
            return [2 /*return*/, {
                    code: 200,
                    headers: [Buffer.from("Server: my_first_http_server")],
                    body: resp
                }];
        });
    });
}
// odyReader from in-memory data
function readerFromMemory(data) {
    var _this = this;
    var done = false;
    return {
        length: data.length,
        read: function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (done) {
                    return [2 /*return*/, Buffer.from("")]; // no more data
                }
                else {
                    done = true;
                    return [2 /*return*/, data];
                }
                return [2 /*return*/];
            });
        }); }
    };
}
// end an HTTP response through the socket
function writeHTTPResp(conn, resp) {
    return __awaiter(this, void 0, void 0, function () {
        var crlf, last, data;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (resp.body.length < 0) {
                        resp.headers.push(Buffer.from("Transfer-Encoding: chunked"));
                    }
                    else {
                        resp.headers.push(Buffer.from("Content-Length: ".concat(resp.body.length)));
                    }
                    // write the header
                    return [4 /*yield*/, soWrite(conn, encodeHTTPResp(resp))];
                case 1:
                    // write the header
                    _a.sent();
                    crlf = Buffer.from("\r\n");
                    last = false;
                    _a.label = 2;
                case 2:
                    if (!!last) return [3 /*break*/, 6];
                    return [4 /*yield*/, resp.body.read()];
                case 3:
                    data = _a.sent();
                    last = data.length == 0; // ended ??
                    // chunked encoding
                    if (resp.body.length < 0) {
                        data = Buffer.concat([
                            Buffer.from(data.length.toString(16)),
                            crlf,
                            data,
                            crlf,
                        ]);
                    }
                    if (!data.length) return [3 /*break*/, 5];
                    return [4 /*yield*/, soWrite(conn, data)];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5: return [3 /*break*/, 2];
                case 6: return [2 /*return*/];
            }
        });
    });
}
function serveClient(conn) {
    return __awaiter(this, void 0, void 0, function () {
        var buf, msg, data, reqBody, res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    buf = { data: Buffer.alloc(0), length: 0 };
                    _a.label = 1;
                case 1:
                    if (!true) return [3 /*break*/, 9];
                    msg = cutMessage(buf);
                    if (!!msg) return [3 /*break*/, 3];
                    return [4 /*yield*/, soRead(conn)];
                case 2:
                    data = _a.sent();
                    bufPush(buf, data);
                    // EOF?
                    if (data.length === 0 && buf.length === 0) {
                        return [2 /*return*/]; // no more requests
                    }
                    if (data.length === 0) {
                        throw new HTTPError(400, "Unexpected EOF.");
                    }
                    // got some data, try it again.
                    return [3 /*break*/, 1];
                case 3:
                    reqBody = readerFromReq(conn, buf, msg);
                    return [4 /*yield*/, handleReq(msg, reqBody)];
                case 4:
                    res = _a.sent();
                    return [4 /*yield*/, writeHTTPResp(conn, res)];
                case 5:
                    _a.sent();
                    // close the connection for HTTP/1.0
                    if (msg.version === "1.0") {
                        return [2 /*return*/];
                    }
                    _a.label = 6;
                case 6: return [4 /*yield*/, reqBody.read()];
                case 7:
                    if (!((_a.sent()).length > 0)) return [3 /*break*/, 8];
                    return [3 /*break*/, 6];
                case 8: return [3 /*break*/, 1];
                case 9: return [2 /*return*/];
            }
        });
    });
}
function newConn(socket) {
    return __awaiter(this, void 0, void 0, function () {
        var conn, exc_1, resp, exc_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    conn = soInit(socket);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, 8, 9]);
                    return [4 /*yield*/, serveClient(conn)];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 9];
                case 3:
                    exc_1 = _a.sent();
                    console.error("exception:", exc_1);
                    if (!(exc_1 instanceof HTTPError)) return [3 /*break*/, 7];
                    resp = {
                        code: exc_1.statusCode,
                        headers: [],
                        body: readerFromMemory(Buffer.from(exc_1.message + "\n"))
                    };
                    _a.label = 4;
                case 4:
                    _a.trys.push([4, 6, , 7]);
                    return [4 /*yield*/, writeHTTPResp(conn, resp)];
                case 5:
                    _a.sent();
                    return [3 /*break*/, 7];
                case 6:
                    exc_2 = _a.sent();
                    return [3 /*break*/, 7];
                case 7: return [3 /*break*/, 9];
                case 8:
                    socket.destroy();
                    return [7 /*endfinally*/];
                case 9: return [2 /*return*/];
            }
        });
    });
}
var server = net.createServer({
    pauseOnConnect: true
});
server.on("connection", newConn);
server.on("error", function (err) {
    throw err;
});
server.listen({ host: "127.0.0.1", port: 6969 });
