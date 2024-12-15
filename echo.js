"use strict";
exports.__esModule = true;
var net = require("net");
function newConnection(socket) {
    console.log("New Conn", socket.remoteAddress, socket.remotePort);
    socket.on("data", function (data) {
        console.log("Data: ", data);
        socket.write(data);
        if (data.includes("q")) {
            console.log("closing.");
            socket.end();
        }
    });
    socket.on("end", function () {
        console.log("EOF.");
    });
}
var server = net.createServer();
server.on("connection", newConnection);
server.on("error", function (err) {
    throw err;
});
server.listen({ host: "127.0.0.1", port: 6969 });
