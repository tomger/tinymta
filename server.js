
var path = require('path');
var fs = require('fs');

var express = require('express')
var app = express()
var GtfsRealtimeBindings = require('gtfs-realtime-bindings');
var Mta = require('mta-gtfs');
var request = require('request');
var csvParse = require('csv-parse');
var file = fs.readFileSync(path.join(__dirname, './node_modules/mta-gtfs/lib/data/gtfs/stops.txt'));
var stops = {};

csvParse(file, {
  columns: true,
  objname: 'stop_id'
}, function (err, data) {
  stops = data;
  // getTrainLines((rv)=>console.log(rv.join('\n')));
});

function getTrainLines(success) {
  var rv = [];
  // 16

  var requestSettings = {
    method: 'GET',
    url: `http://datamine.mta.info/mta_esi.php?key=${process.env.MTA_API_KEY}&feed_id=1`,
    encoding: null
  };
  request(requestSettings, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var feed = GtfsRealtimeBindings.FeedMessage.decode(body);
      var trains = feed.entity
      .filter(function(entity) {
        if (!entity.trip_update) {
          return false;
        }
        // if (entity.trip_update.trip.route_id !== 'Q') {
        //   return false;
        // }
        return true;
      })
      rv.push(trains.length);
      trains.forEach(function(entity) {
        entity.trip_update.stop_time_update //.splice(0, 3)
        .filter(update => {
          return stops[update.stop_id] && update.arrival;
        })
        .filter(update => {
          return update.stop_id === '236N'
        })
        .forEach(function(update) {
          // console.log(entity.trip_update.stop_time_update);
          rv.push({
            route: entity.trip_update.trip.route_id,
            stop_id: update.stop_id,
            stop: stops[update.stop_id].stop_name,
            time: update.arrival.time.low*1000
          });
        })
      });
      success(rv);
    };
  });
}


app.set('port', (process.env.PORT || 5000))
// app.use(express.static(__dirname + '/public'))

app.get('/', function(request, response) {
  getTrainLines((rv)=> {
    rv.sort((a, b) => {
      return a.time - b.time;
    })
    response.send(rv.map(train => {
      return `🚂 ${train.route} <script>document.write((new Date(${train.time})).toLocaleTimeString())</script>`
    }).join('<br/>'))
  });
})

app.listen(app.get('port'), function() {
  console.log("Node app is running at localhost:" + app.get('port'))
})
