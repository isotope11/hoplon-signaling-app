var express = require('express');
var app = express();
var fs = require('fs');
var open = require('open');
var url = require("url");
var path = require("path");
var https = require('https');
var http = require('http');
var uuid = require('node-uuid');
var options = {
  // key: fs.readFileSync('./fake-keys/privatekey.pem'),
  // cert: fs.readFileSync('./fake-keys/certificate.pem')
};
var serverPort = (process.env.PORT  || 3000);

var server;
if (process.env.LOCAL) {
  server = https.createServer(options, app);
} else {
  server = http.createServer(app);
}
var io = require('socket.io')(server);

var roomList = {};

app.get('/', function(req, res){
  console.log('get /');
  res.sendFile(__dirname + '/index.html');
});
server.listen(serverPort, function(){
  console.log('server up and running at %s port', serverPort);
  if (process.env.LOCAL) {
    open('https://secret-sands-60868.herokuapp.com/')
  }
});

function socketIdsInRoom(name) {
  var socketIds = io.nsps['/'].adapter.rooms[name];
  if (socketIds) {
    var collection = [];
    for (var key in socketIds) {
      collection.push(key);
    }
    return collection;
  } else {
    return [];
  }
}

io.on('connection', function(socket){
  console.log('connection');
  socket.on('disconnect', function(){
    console.log('disconnect');
    if (socket.room) {
      var room = socket.room;
      io.to(room).emit('leave', socket.id);
      socket.leave(room);
    }
  });

  socket.on('join', function(name, callback){
    console.log('join', name);
    var socketIds = socketIdsInRoom(name);
    callback(socketIds);
    socket.join(name);
    socket.room = name;
  });


  socket.on('exchange', function(data){
    console.log('exchange', data);
    data.from = socket.id;
    var to = io.sockets.connected[data.to];
    to.emit('exchange', data);
  });

  socket.on("muteAudio", function(data){
    console.log('muteAudio', data);
    data.from = socket.id;
    var to = io.sockets.connected[data.to];
    to.emit('muteAudio', data);
  });

  socket.on('message', function (data) {
    var fileName = uuid.v4();
    socket.emit('ffmpeg-output', 0);
    writeToDisk(data.audio.dataURL, fileName + '.wav');
    writeToDisk(data.video.dataURL, fileName + '.webm');
    merge(socket, fileName);
  });
});


function writeToDisk(dataURL, fileName) {
    var fileExtension = fileName.split('.').pop(),
        fileRootNameWithBase = './uploads/' + fileName,
        filePath = fileRootNameWithBase,
        fileID = 2,
        fileBuffer;

    // @todo return the new filename to client
    while (fs.existsSync(filePath)) {
        filePath = fileRootNameWithBase + '(' + fileID + ').' + fileExtension;
        fileID += 1;
    }

    dataURL = dataURL.split(',').pop();
    fileBuffer = new Buffer(dataURL, 'base64');
    fs.writeFileSync(filePath, fileBuffer);

    console.log('filePath', filePath);
}

function merge(socket, fileName) {
    var FFmpeg = require('fluent-ffmpeg');

    var audioFile = path.join(__dirname, 'uploads', fileName + '.wav'),
        videoFile = path.join(__dirname, 'uploads', fileName + '.webm'),
        mergedFile = path.join(__dirname, 'uploads', fileName + '-merged.webm');

    new FFmpeg({
            source: videoFile
        })
        .addInput(audioFile)
        .on('error', function (err) {
            socket.emit('ffmpeg-error', 'ffmpeg : An error occurred: ' + err.message);
        })
        .on('progress', function (progress) {
            socket.emit('ffmpeg-output', Math.round(progress.percent));
        })
        .on('end', function () {
            socket.emit('merged', fileName + '-merged.webm');
            console.log('Merging finished !');

            // removing audio/video files
            fs.unlink(audioFile);
            fs.unlink(videoFile);
        })
        .saveToFile(mergedFile);
}
