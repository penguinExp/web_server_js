import * as net from "net";
import * as fs from "fs/promises";

// the maximum length of an HTTP header
const kMaxHeaderLen = 1024 * 8;

// A promise based api for TCP Sockets
type TCPConn = {
  // the JS Socket Object
  socket: net.Socket;

  // the callbacks of the promise of the current read
  reader: null | {
    resolve: (value: Buffer) => void;
    reject: (reason: Error) => void;
  };

  err: null | Error;

  // EOF, from the 'end' event
  ended: Boolean;
};

// a dynamic size buffer
type DynBuf = {
  data: Buffer;
  length: number;
};

// a parsed HTTP request header
type HTTPReq = {
  method: string;
  uri: Buffer;
  version: string;
  headers: Buffer[];
};

// an HTTP response
type HTTPRes = {
  code: number;
  headers: Buffer[];
  body: BodyReader;
};

// an interface for reading/writing data from/to the HTTP body.
type BodyReader = {
  // the "Content-Length", -1 if unknown.
  length: number;

  // read data. returns an empty buffer after EOF.
  read: () => Promise<Buffer>;
};

type BufferGenerator = AsyncGenerator<Buffer, void, void>;

class HTTPError extends Error {
  public statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HTTPError";
  }
}

// creates a wrapper from net.Socket
function soInit(socket: net.Socket): TCPConn {
  const conn: TCPConn = {
    socket,
    reader: null,
    ended: false,
    err: null,
  };

  socket.on("data", (data: Buffer) => {
    console.assert(conn.reader);

    // pause the 'data' event until the next read
    conn.socket.pause();

    // fulfill the promise of the current read
    conn.reader!.resolve(data);
    conn.reader = null;
  });

  // this also fulfills the current read
  socket.on("end", () => {
    conn.ended = true;

    if (conn.reader) {
      conn.reader.resolve(Buffer.from(""));
      conn.reader = null;
    }
  });

  socket.on("error", (err: Error) => {
    conn.err = err;

    if (conn.reader) {
      conn.reader.reject(err);
      conn.reader = null;
    }
  });

  return conn;
}

// returns an empty `Buffer` after EOF
function soRead(conn: TCPConn): Promise<Buffer> {
  // reader should be null, so we can avoid concurrent calls
  console.assert(!conn.reader);

  return new Promise((resolve, reject) => {
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
    conn.reader = { reject, resolve };

    // the 'data' callback of the socket pauses after reading
    // resume the 'data' event to fulfill the promise later
    conn.socket.resume();
  });
}

function soWrite(conn: TCPConn, data: Buffer): Promise<void> {
  console.assert(data.length > 0);

  return new Promise((resolve, reject) => {
    if (conn.err) {
      reject(conn.err);
      return;
    }

    conn.socket.write(data, (err?: Error) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// append data to DynBuffer
function bufPush(buf: DynBuf, data: Buffer): void {
  const newLen = buf.length + data.length;

  if (buf.data.length < newLen) {
    // grow the capacity by the power if two
    let cap = Math.max(buf.data.length, 32);

    while (cap < newLen) {
      cap *= 2;
    }

    const grown = Buffer.alloc(cap);
    buf.data.copy(grown, 0, 0);

    buf.data = grown;
  }

  data.copy(buf.data, buf.length, 0);
  buf.length = newLen;
}

// remove the data from the front
function bufPop(buf: DynBuf, len: number): void {
  buf.data.copyWithin(0, len, buf.length);
  buf.length -= len;
}

// parse & remove a header from the beginning of the buffer if possible
function cutMessage(buf: DynBuf): null | HTTPReq {
  // the end of the header is marked by '\r\n\r\n'
  const idx = buf.data.subarray(0, buf.length).indexOf("\r\n\r\n");
  if (idx < 0) {
    if (buf.length >= kMaxHeaderLen) {
      throw new HTTPError(413, "header is too large");
    }
    return null; // need more data
  }
  // parse & remove the header
  const msg = parseHTTPReq(buf.data.subarray(0, idx + 4));
  bufPop(buf, idx + 4);
  return msg;
}

function splitLines(data: Buffer): Buffer[] {
  const lines: Buffer[] = [];
  let start = 0;

  for (let i = 0; i < data.length; i++) {
    // Look for line endings (CRLF or LF)
    if (data[i] === 0x0a) {
      // LF
      const end = i > 0 && data[i - 1] === 0x0d ? i - 1 : i; // Handle CRLF (\r\n)
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

function parseDec(input: string): number {
  const trimmed = input.trim();

  // Ensure the string contains only digits
  if (!/^\d+$/.test(trimmed)) {
    return NaN; // Return NaN if invalid
  }

  return parseInt(trimmed, 10);
}

function fieldGet(headers: Buffer[], fieldName: string): Buffer | null {
  const lowerFieldName = fieldName.toLowerCase();

  for (const header of headers) {
    const headerStr = header.toString("latin1");
    const separatorIndex = headerStr.indexOf(":");

    if (separatorIndex > 0) {
      const name = headerStr.slice(0, separatorIndex).trim();

      // Check if the header name matches (case-insensitive)
      if (name.toLowerCase() === lowerFieldName) {
        const value = headerStr.slice(separatorIndex + 1).trim();
        return Buffer.from(value, "latin1");
      }
    }
  }

  return null; // Return null if the field is not found
}

function parseRequestLine(line: Buffer): [string, string, string] {
  const lineStr = line.toString().trim();
  const parts = lineStr.split(" ");

  if (parts.length !== 3) {
    throw new HTTPError(400, "Invalid request line");
  }

  const [method, uri, version] = parts;

  // Validate HTTP version
  if (!/^HTTP\/\d\.\d$/.test(version)) {
    throw new HTTPError(400, "Invalid HTTP version");
  }

  return [method, uri, version];
}

function encodeHTTPResp(resp: HTTPRes): Buffer {
  // Construct the status line: `HTTP/1.1 <code> <reasonPhrase>`
  const reasonPhrase = getReasonPhrase(resp.code);
  const statusLine = `HTTP/1.1 ${resp.code} ${reasonPhrase}`;

  // Serialize headers
  const headers = resp.headers
    .map((header) => header.toString("latin1"))
    .join("\r\n");

  // Combine the status line, headers, and end with an empty line
  const responseString = `${statusLine}\r\n${headers}\r\n\r\n`;

  // Return the serialized response as a Buffer
  return Buffer.from(responseString, "latin1");
}

function getReasonPhrase(code: number): string {
  const phrases: Record<number, string> = {
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
    503: "Service Unavailable",
  };

  return phrases[code] || "Unknown";
}

function validateHeader(header: Buffer): boolean {
  const headerStr = header.toString();
  const separatorIndex = headerStr.indexOf(":");

  // Ensure the header contains a `:` separator and has non-empty name/value
  if (separatorIndex <= 0 || separatorIndex === headerStr.length - 1) {
    return false;
  }

  const name = headerStr.slice(0, separatorIndex).trim();
  const value = headerStr.slice(separatorIndex + 1).trim();

  // Validate header name (RFC 7230 field-name rules)
  const nameRegex = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
  if (!nameRegex.test(name)) {
    return false;
  }

  // Value can contain any printable characters (or be empty after trimming)
  const valueRegex = /^[\t -~]*$/;
  if (!valueRegex.test(value)) {
    return false;
  }

  return true;
}

function readerFromGenerator(gen: BufferGenerator): BodyReader {
  return {
    length: -1,
    read: async (): Promise<Buffer> => {
      const r = await gen.next();

      if (r.done || !r.value) {
        // Handle EOF or if the generator unexpectedly yields `undefined`
        return Buffer.from(""); // EOF
      } else {
        console.assert(r.value.length > 0); // `r.value` is guaranteed to be a Buffer
        return r.value;
      }
    },
  };
}

// count to 99
async function* countSheep(): BufferGenerator {
  for (let i = 0; i < 100; i++) {
    // sleep 1s, then output the counter
    await new Promise((resolve) => setTimeout(resolve, 1000));

    yield Buffer.from(`${i}\n`);
  }
}

// parse an HTTP request header
function parseHTTPReq(data: Buffer): HTTPReq {
  // split the data into lines
  const lines: Buffer[] = splitLines(data);

  // the first line is `METHOD URI VERSION`
  const [method, uri, version] = parseRequestLine(lines[0]);

  // followed by header fields in the format of `Name: value'
  const headers: Buffer[] = [];

  for (let i = 1; i < lines.length - 1; i++) {
    const h = Buffer.from(lines[i]); // copy

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
    headers: headers,
  };
}

async function bufExpectMore(
  conn: TCPConn,
  buf: DynBuf,
  context: string
): Promise<void> {
  const newData = await soRead(conn);

  if (!newData || newData.length === 0) {
    throw new Error(`Unexpected end of data while reading ${context}.`);
  }

  buf.data = Buffer.concat([buf.data, newData]);
  buf.length += newData.length;
}

async function* readChunks(conn: TCPConn, buf: DynBuf): BufferGenerator {
  for (let last = false; !last; ) {
    // Find the end of the chunk size line
    const idx = buf.data.subarray(0, buf.length).indexOf("\r\n");

    if (idx < 0) {
      // Need more data if CRLF is not found
      await bufExpectMore(conn, buf, "chunk size");
      continue;
    }

    // Parse the chunk size (hexadecimal) and remove the line
    const sizeLine = buf.data.subarray(0, idx).toString("latin1").trim();
    let remain: number;

    try {
      remain = parseInt(sizeLine, 16); // Parse hex chunk size
      if (isNaN(remain) || remain < 0) {
        throw new Error("Invalid chunk size.");
      }
    } catch (err) {
      throw new Error(`Failed to parse chunk size: ${sizeLine}`);
    }

    bufPop(buf, idx + 2); // Remove the chunk size line and CRLF

    // Check if this is the last chunk
    last = remain === 0;

    // Read and yield the chunk data
    while (remain > 0) {
      if (buf.length === 0) {
        await bufExpectMore(conn, buf, "chunk data");
      }
      const consume = Math.min(remain, buf.length);
      const data = Buffer.from(buf.data.subarray(0, consume));
      bufPop(buf, consume);
      remain -= consume;
      yield data;
    }

    // Remove the CRLF following the chunk data
    if (buf.length < 2) {
      await bufExpectMore(conn, buf, "CRLF after chunk data");
    }
    const crlf = buf.data.subarray(0, 2).toString("latin1");
    if (crlf !== "\r\n") {
      throw new Error("Invalid chunk data termination (missing CRLF).");
    }
    bufPop(buf, 2); // Remove CRLF
  }
}

// BodyReader from an HTTP request
function readerFromReq(conn: TCPConn, buf: DynBuf, req: HTTPReq): BodyReader {
  let bodyLen = -1;
  const contentLen = fieldGet(req.headers, "Content-Length");

  if (contentLen) {
    bodyLen = parseDec(contentLen.toString("latin1"));

    if (isNaN(bodyLen)) {
      throw new HTTPError(400, "bad Content-Length.");
    }
  }

  const bodyAllowed = !(req.method === "GET" || req.method === "HEAD");
  const chunked =
    fieldGet(req.headers, "Transfer-Encoding")?.equals(
      Buffer.from("chunked")
    ) || false;

  if (!bodyAllowed && (bodyLen > 0 || chunked)) {
    throw new HTTPError(400, "HTTP body not allowed.");
  }

  if (!bodyAllowed) {
    bodyLen = 0;
  }

  if (bodyLen >= 0) {
    // "Content-Length" is present
    return readerFromConnLength(conn, buf, bodyLen);
  } else if (chunked) {
    // chunked encoding
    return readerFromGenerator(readChunks(conn, buf));
  } else {
    // read the rest of the connection

    // TODO: Do this
    // return readFromConnEOF(conn, buf);

    throw new HTTPError(501, "TODO");
  }
}

// BodyReader from a socket with a known length
function readerFromConnLength(
  conn: TCPConn,
  buf: DynBuf,
  remain: number
): BodyReader {
  return {
    length: remain,
    read: async (): Promise<Buffer> => {
      if (remain === 0) {
        return Buffer.from(""); // done
      }
      if (buf.length === 0) {
        // try to get some data if there is none
        const data = await soRead(conn);
        bufPush(buf, data);
        if (data.length === 0) {
          // expect more data!
          throw new Error("Unexpected EOF from HTTP body");
        }
      }
      // consume data from the buffer
      const consume = Math.min(buf.length, remain);
      remain -= consume;
      const data = Buffer.from(buf.data.subarray(0, consume));
      bufPop(buf, consume);
      return data;
    },
  };
}

// a sample request handler
async function handleReq(req: HTTPReq, body: BodyReader): Promise<HTTPRes> {
  // act on the request URI
  let resp: BodyReader;

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

  return {
    code: 200,
    headers: [Buffer.from("Server: my_first_http_server")],
    body: resp,
  };
}

// odyReader from in-memory data
function readerFromMemory(data: Buffer): BodyReader {
  let done = false;
  return {
    length: data.length,
    read: async (): Promise<Buffer> => {
      if (done) {
        return Buffer.from(""); // no more data
      } else {
        done = true;
        return data;
      }
    },
  };
}

// end an HTTP response through the socket
async function writeHTTPResp(conn: TCPConn, resp: HTTPRes): Promise<void> {
  if (resp.body.length < 0) {
    resp.headers.push(Buffer.from("Transfer-Encoding: chunked"));
  } else {
    resp.headers.push(Buffer.from(`Content-Length: ${resp.body.length}`));
  }

  // write the header
  await soWrite(conn, encodeHTTPResp(resp));

  const crlf = Buffer.from("\r\n");

  for (let last = false; !last; ) {
    let data = await resp.body.read();

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

    if (data.length) {
      await soWrite(conn, data);
    }
  }
}

async function serveClient(conn: TCPConn): Promise<void> {
  const buf: DynBuf = { data: Buffer.alloc(0), length: 0 };

  while (true) {
    // try to get 1 request header from the buffer
    const msg: null | HTTPReq = cutMessage(buf);

    if (!msg) {
      // need more data
      const data = await soRead(conn);
      bufPush(buf, data);

      // EOF?
      if (data.length === 0 && buf.length === 0) {
        return; // no more requests
      }

      if (data.length === 0) {
        throw new HTTPError(400, "Unexpected EOF.");
      }

      // got some data, try it again.
      continue;
    }

    // process the message and send the response
    const reqBody: BodyReader = readerFromReq(conn, buf, msg);

    const res: HTTPRes = await handleReq(msg, reqBody);
    await writeHTTPResp(conn, res);

    // close the connection for HTTP/1.0
    if (msg.version === "1.0") {
      return;
    }

    // make sure that the request body is consumed completely
    while ((await reqBody.read()).length > 0) {
      /* empty */
    }
  } // loop for IO
}

async function newConn(socket: net.Socket): Promise<void> {
  const conn: TCPConn = soInit(socket);

  try {
    await serveClient(conn);
  } catch (exc) {
    console.error("exception:", exc);

    if (exc instanceof HTTPError) {
      // intended to send an error response
      const resp: HTTPRes = {
        code: exc.statusCode,
        headers: [],
        body: readerFromMemory(Buffer.from(exc.message + "\n")),
      };

      try {
        await writeHTTPResp(conn, resp);
      } catch (exc) {
        /* ignore */
      }
    }
  } finally {
    socket.destroy();
  }
}

const server = net.createServer({
  pauseOnConnect: true, // required for `TCPConn`
});

server.on("connection", newConn);
server.on("error", (err: Error) => {
  throw err;
});

server.listen({ host: "127.0.0.1", port: 6969 });
