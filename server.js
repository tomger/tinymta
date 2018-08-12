
var path = require('path');
var fs = require('fs');

var express = require('express')
var app = express()
var GtfsRealtimeBindings = require('gtfs-realtime-bindings');
var Mta = require('mta-gtfs');
var request = require('request');
var csvParse = require('csv-parse');
var file = fs.readFileSync(path.join(__dirname, './node_modules/mta-gtfs/lib/data/gtfs/stops.txt'));
csvParse(file, {
  columns: true,
  objname: 'stop_id'
}, function (err, data) {
  run(data);
});

function run(stops) {
  var requestSettings = {
    method: 'GET',
    url: `http://datamine.mta.info/mta_esi.php?key=${process.env.MTA_API_KEY}&feed_id=16`,
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
        if (entity.trip_update.trip.route_id !== 'Q') {
          return false;
        }
        return true;
      })
      console.log(trains.length);
      trains.forEach(function(entity) {
        // console.log(entity.trip_update.trip);
        console.log('🚂', entity.trip_update.trip.route_id, entity.id)
        entity.trip_update.stop_time_update //.splice(0, 3)
        .forEach(function(update) {
          // console.log(entity.trip_update.stop_time_update);
          if (update.stop_id === 'Q05S' && stops[update.stop_id]) {
            console.log(
              update.stop_id,
              stops[update.stop_id].stop_name,
              (new Date(update.arrival.time.low*1000)).toLocaleTimeString()
            );
          };
        })
      });
    };
  });
}


app.set('port', (process.env.PORT || 5000))
app.use(express.static(__dirname + '/public'))

app.get('/', function(request, response) {
  response.send('Hello World!')
})

app.listen(app.get('port'), function() {
  console.log("Node app is running at localhost:" + app.get('port'))
})
