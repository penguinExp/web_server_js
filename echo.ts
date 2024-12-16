import * as net from "net";

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
type DynBuffer = {
  data: Buffer;
  length: number;
};

// append data to DynBuffer
function bufPush(buf: DynBuffer, data: Buffer): void {
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
function bufPop(buf: DynBuffer, len: number): void {
  buf.data.copyWithin(0, len, buf.length);
  buf.length -= len;
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

async function newConnection(socket: net.Socket): Promise<void> {
  console.log("New Conn", socket.remoteAddress, socket.remotePort);

  try {
    await serveClient(socket);
  } catch (exc) {
    console.error("[ERR]: ", exc);
  } finally {
    socket.destroy();
  }
}

function cutMessage(buf: DynBuffer): null | Buffer {
  // messages are separated by '\n'
  const idx = buf.data.subarray(0, buf.length).indexOf("\n");

  if (idx < 0) {
    return null; // not complete
  }

  // make a copy of the message and move the remaining data to the front
  const msg = Buffer.from(buf.data.subarray(0, idx + 1));
  bufPop(buf, idx + 1);

  return msg;
}

async function serveClient(socket: net.Socket): Promise<void> {
  const conn: TCPConn = soInit(socket);
  const buf: DynBuffer = { data: Buffer.alloc(0), length: 0 };

  while (true) {
    // try to get 1 msg from the buffer
    const msg: null | Buffer = cutMessage(buf);

    if (!msg) {
      // need more data
      const data = await soRead(conn);
      bufPush(buf, data);

      // EOF?
      if (data.length === 0) {
        console.log("EOC");

        return;
      }

      // got some data, try it again
      continue;
    }

    // Process the message and send the response
    if (msg.equals(Buffer.from("quit\n"))) {
      await soWrite(conn, Buffer.from("bye\n"));
      socket.destroy();

      return;
    } else {
      const reply = Buffer.concat([Buffer.from("ECHO: "), msg]);
      await soWrite(conn, reply);
    }
  } // loop for messages
}

const server = net.createServer({
  pauseOnConnect: true, // required for `TCPConn`
});

server.on("connection", newConnection);
server.on("error", (err: Error) => {
  throw err;
});

server.listen({ host: "127.0.0.1", port: 6969 });
