var express = require('express');
var app = express()
  , server = require('http').createServer(app)
  , io = require('socket.io').listen(server);
var fs = require('fs');

server.listen(8000);
io.set('heartbeat interval', 10); //cambie este valor de 20 a 10 para que ande mas rapido.
io.set('heartbeat timeout', 240); 
io.set('transports',[ 'xhr-polling' ]);

var adminSocket;
var cameras = {};
var camerasCount = 0;

var broadcastSendPicture = function() {
	for (camera in cameras) {
		console.log("please camera "+camera + " take a photo!");
		cameras[camera].emit("takePicture", "");
	}
};

var registerSocket = function(socket) {
	if (!cameras[socket.id]) {
		cameras[socket.id] = socket;
		camerasCount++;
		console.log("registering socket "+ socket.id);
		console.log("cameras count"+ camerasCount);
		socket.emit("id", camerasCount);
	}
};

app.get("/cameras", function(req, res) {
	var file = __dirname + '/syncCamera.html';
	
	io.sockets.on('connection', function (socket) {
		registerSocket(socket);
		  
		//pictureData contiene la imagen y el id de la camara.
		socket.on("sendPicture", function (pictureData) {
			adminSocket.emit("receivedPicture", pictureData);
		});
		
	});
	
    res.sendfile(file);
});

app.get('/admin', function(req, res){
  io.sockets.on('connection', function (socket) {
	adminSocket = socket;
	
	socket.on("refreshServer", function() {
		cameras = {};
		camerasCount = 0;
	  });
	  
	socket.on('takePictures', function (data) {
		console.log("Admin say take picture: ");
		broadcastSendPicture();
	  });
	  
	adminSocket.emit("sendRegisteredsCams", camerasCount); 
  });

  io.sockets.on('disconnect', function (socket) {
	console.log("socket.id : "+socket.id+" disconnected");
  });
  
  res.sendfile(__dirname + "/admin.html");
});