import * as net from "net";

function newConnection(socket: net.Socket): void {
  console.log("New Conn", socket.remoteAddress, socket.remotePort);

  socket.on("data", (data: Buffer) => {
    console.log("Data: ", data);
    socket.write(data);

    if (data.includes("q")) {
      console.log("closing.");
      socket.end();
    }
  });

  socket.on("end", () => {
    console.log("EOF.");
  });
}

let server = net.createServer();

server.on("connection", newConnection);
server.on("error", (err: Error) => {
  throw err;
});

server.listen({ host: "127.0.0.1", port: 6969 });
