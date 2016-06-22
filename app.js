/* jshint node:true */


var express = require('express');
var app = express(),
    server = require('http').createServer(app),
    io = require('socket.io').listen(server),
    fs = require('fs');

var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/synccams');

var db = mongoose.connection;


var momentSchema = mongoose.Schema({
    id: String,
    date: Date,
    pictures: Array
});

var Moment = mongoose.model('Moment', momentSchema);

db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function (callback) {
  console.log('Connected to DB: ', callback);
});

function getMoments(response, error) {
  Moment.find(function (err, moments) {
    if (err) {
      error(err);
    }
    else {
      response(moments);
    }
  }).sort({_id:1}).limit(10);
}

function getMoment(id, response, error) {
  Moment.find({_id: id},function (err, moments) {
    if (err) {
      error(err);
    }
    else {
      response(moments);
    }
  });
}

function saveMoment(data, cb, errorcb) {
  var moment = new Moment({
    id: data.id,
    date: new Date(),
    pictures: data.pictures
  });
  moment.save(function(err, savedMoment) {
    if (err && errorcb) {
      error(err);
    } else {
      cb(savedMoment);
    }
  });
}

server.listen(process.env.PORT || 8000);
//io.set('heartbeat interval', 20); //cambie este valor de 20 a 10 para que ande mas rapido.
//io.set('heartbeat timeout', 240);
//io.set('transports',[ ]);

var adminSocket;
var cameras = {};
var camerasCount = 0;

var rooms = {};

var Room = function(id) {
  this.id = id;
  this.admin = null;
  this.cameras = {};
  this.pictures = [];
  this.picturesURLs = [];
};

Room.prototype.getCamerasCount = function() {
  var i = 0;
  for (var cameraId in this.cameras) {
    i++;
  }
  return i;
};

Room.prototype.addCamera = function(socket) {
  console.log('adding camera');
  if (this.getCamerasCount() === 0) {
    console.log('is the first camera == admin camera');
    this.admin = socket;
    socket.emit('admin');
  }

  this.cameras[socket.id] = socket;
  for (var cameraId in this.cameras) {
    var camera = this.cameras[cameraId];
    camera.emit("camerasCount", this.getCamerasCount());
  }
};

Room.prototype.removeCamera = function(id) {
  delete this.cameras[id];

  if (this.admin === id) {
    if (this.getCamerasCount() === 0) {
      this.admin = null;
    }
    else {
      var i = 0;
      for (var index in this.cameras) {
        this.admin = this.cameras[index];
        break;
      }
    }
  }

  for (var cameraId in this.cameras) {
    var camera = this.cameras[cameraId];
    camera.emit("camerasCount", this.getCamerasCount());
  }
};

Room.prototype.takePictures = function() {
  this.pictures.length = 0;
  this.picturesURLs.length = 0;
  for (var cameraId in this.cameras) {
    var camera = this.cameras[cameraId];
    console.log("please camera "+camera.id + " take a photo!");
    camera.emit("takePicture", "");
  }
};

function decodeBase64Image(dataString) {
  var matches = dataString.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/),
    response = {};

  if (matches.length !== 3) {
    return new Error('Invalid input string');
  }

  response.type = matches[1];
  response.data = new Buffer(matches[2], 'base64');

  return response;
}

Room.prototype.addPicture = function(pictureData) {
  console.log('Picture recieved!');
  var imageBuffer = decodeBase64Image(pictureData.picture);
  var _this = this;
  fs.writeFile('pictures/image-'+this.id+'-'+this.pictures.length+'.jpg', imageBuffer.data, function(err) {
    if (err) {
      console.log('Error saving image to file system.', err);
    }
    _this.pictures.push(pictureData);
    _this.picturesURLs.push('/picture/image-'+_this.id+'-'+_this.picturesURLs.length);
    if (_this.getCamerasCount() === _this.pictures.length) {
      _this.sendPictures();
      saveMoment({
        id: generateId(),
        pictures: _this.picturesURLs
      }, function(moment) {
        console.log('saved!');

      });
    }
  });

};

Room.prototype.sendPictures = function() {
  for (var cameraId in this.cameras) {
    var camera = this.cameras[cameraId];
    console.log("sending pictures to "+camera.id);
    //camera.emit("pictures", this.pictures);
    camera.emit("picturesURLs", this.picturesURLs);
  }
};

Room.prototype.setAdmin = function(id) {

};

function createRoom(id) {
  var room = new Room(id);
  rooms[id] = room;
  console.log('Room ' + id + ' created');
  return room;
}

var broadcastSendPicture = function() {
  for (var cameraId in cameras) {
    var camera = cameras[cameraId];
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

/*app.get("/cameras", function(req, res) {
  var file = __dirname + '/syncCamera.html';

  io.sockets.on('connection', function (socket) {
    registerSocket(socket);

    //pictureData contiene la imagen y el id de la camara.
    socket.on("sendPicture", function (pictureData) {
      adminSocket.emit("receivedPicture", pictureData);
    });

  });

  res.sendFile(file);
});*/

function generateId() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  var id = '';
  for (var i = 0; i < 8; i++) {
      id += chars[Math.floor((Math.random() * 36))];
  }
  return id;
}

  var roomBySocket = {};

  io.sockets.on('connection', function (socket) {

    socket.on('createRoom', function(id) {

      roomBySocket[socket.id] = id;

      if (rooms[id]) {
        console.log('alerady exists room ', id);
        rooms[id].addCamera(socket);
      }
      else {
        console.log('createRoom ', id);
        createRoom(id).addCamera(socket);
      }

    });

    socket.on('takePictures', function (id) {
      console.log("Admin say take picture: ");
      if (rooms[id]) {
        rooms[id].takePictures();
      }
    });

    //pictureData contiene la imagen y el id de la camara.
    socket.on("sendPicture", function (pictureData) {
      if (rooms[pictureData.roomId]) {
        rooms[pictureData.roomId].addPicture(pictureData);
      }
    });

    socket.on('disconnect', function () {
      console.log("socket.id : "+socket.id+" disconnected");
      var roomId = roomBySocket[socket.id];
      if (roomId && rooms[roomId]) {
        rooms[roomId].removeCamera(socket.id);
        if (rooms[roomId] && !rooms[roomId].cameras.length) {
          delete rooms[roomId];
        }
      }
      delete roomBySocket[socket.id];
    });

  });

function reqHandler (req, res) {

  var roomId = req.params.id;
  if (roomId === 'favicon.ico')  {
    res.sendFile( __dirname + '/favicon.ico');
    return;
  }

  if (roomId === 'syncCamera.html')  {
    res.sendFile( __dirname + '/syncCamera.html');
    return;
  }

  if (roomId === 'home2.html')  {
    res.sendFile( __dirname + '/home2.html');
    return;
  }

  var file = __dirname + '/home.html';
  res.sendFile(file);
}

app.get("/", reqHandler);
app.get("/:id", reqHandler);

/*app.get('/admin', function(req, res){
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

  res.sendFile(__dirname + "/admin.html");
});*/

app.get('/js/:name', function(req, res){
  res.sendFile(__dirname + "/js/" + req.params.name);
});

app.get('/img/:name', function(req, res){
  res.sendFile(__dirname + '/img/' + req.params.name);
});

app.get('/picture/:id', function(req, res){
  res.sendFile(__dirname + '/pictures/' + req.params.id + '.jpg');
});

app.get('/moments/:id', function(req, res){
  var id = req.params.id;
  getMoment(id, function(response) {
    res.send('<img src="'+response[0].pictures[0]+'">');
  }, function(reason) {
    res.send('404 Not found');
  });

  //res.sendFile(__dirname + '/moment.html');
});

app.get('/api/moments', function(req, res){
  console.log('GET /api/moments');
  getMoments(function(response) {
    res.json(response);
  }, function(reason) {
    res.json({error: reason});
  });
});

app.get('/api/moments/:id', function(req, res){
  var id = req.params.id;
  console.log('GET /api/moments/' + id);
  getMoment(id, function(response) {
    res.json(response);
  }, function(reason) {
    res.json({error: reason});
  });
});

console.log('Started!');
