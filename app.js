var express = require('express');
var bodyParser = require('body-parser');
var request = require('request');
var datejs = require('datejs');
var fs = require("fs");
var Mustache = require("mustache");
var q = require("q");

function send(uri, payload, callback) {
  request({
    uri: uri,
    method: 'POST',
    body: JSON.stringify(payload)
  }, function(error, response, body) {
    if (error) {
      return callback(error);
    }

    callback(null, response.statusCode, body);
  });
}

// timestr: an interval, e.g. '1/24 3-5pm' or '1/24 3am - 1/31 6pm'
function parseTimes(timestr) {
    var times = timestr.split("-");
    if (times[1].indexOf('/') == -1) {
        times[1] = times[0].split(' ')[0] + ' ' + times[1];
    }
    var re = /.*[apm]$/; // test whether am/pm is supplied
                         // if not, assume am and adjust as needed
    function parseDate(str) {
        // remove ambiguity of 'M/dd h','M/yy d' and 'MM/d h','yy/m d'
        var exact = Date.parseExact(str, 'M/d h')
        return exact || Date.parse(str); // using default is safe when format is unambiguous
    }
    var starttime = parseDate(times[0], 'M/d h'), startfixed = re.test(times[0]);
    var endtime = parseDate(times[1], 'M/d h'), endfixed = re.test(times[1]);

    // adjust am/pm
    var day = 86400000; // 24 * 60 * 60 * 1000
    var elapsed = endtime - starttime;
    if (elapsed < 0 && !endfixed) {
        // handles [11-1 --> 11a-1p]
        endtime = endtime.add(12).hours();
    }
    if (day/2 < elapsed && elapsed < day && !startfixed) {
        // handles [3-5p --> 3p-5p] (only if within 24 hours)
        starttime = starttime.add(12).hours();
    }
    return [starttime, endtime];
}

/* Database connection */

var pgp = require('pg-promise')({
    promiseLib: q
});

var db = pgp(process.env.DATABASE_URL);


// /* Slash command format: /practice 1/24 3-5pm | Barry | throwing and drills */
var practice = function (req, res, next) {
    var message = req.body.text;
    var pieces = message.split("|");
    var practiceLocation = pieces[1];
    var description = pieces[2];
    var times = parseTimes(pieces[0]);
    var starttime = times[0];
    var endtime = times[1];
    var format = 'MM-dd-yy HH:mm:ss',
        query = "INSERT INTO practices (starttime, endtime, location, message) VALUES ($1, $2, $3, $4) RETURNING id";

    db.one(query, [starttime.toString(format), endtime.toString(format), practiceLocation, description]).catch(function(err) {
        next(err);
    }).then(function(row) {
        var id = row.id;

        var botPayload = {};
        var viewUrl = '<https://mit-ult-slack.herokuapp.com/practice?id=' + id + '|Responses>';
        var usage = "(Reply with /in or /out [reason])";
        botPayload.text = printTime(starttime, endtime) + "\n" + practiceLocation + "\n" + description + "\n" + viewUrl + "\n" + usage;
        var path = process.env.SLACK_SERVICE_PATH;
        var uri = 'https://hooks.slack.com/services' + path;

        send(uri, botPayload, function (error, status, body) {
            if (error) {
                return next(error);
            } else if (status !== 200) {
                // inform user that our Incoming WebHook failed
                return next(new Error('Incoming WebHook: ' + status + ' ' + body));
            } else {
                return res.status(200).end();
            }
        });
    }).done();
};

var respondWithPage = function(res, fileName, hash) {
    fs.readFile(fileName, function (err, data) {
        if (err) {
        } else {
            var template = data.toString(),
                html = Mustache.to_html(template, hash);
            res.status(200).send(html);
        }
    });
};

var printTime = function(starttime, endtime) {
    return starttime.toString("dddd M/d h:mm tt") + "-" + endtime.toString("h:mm tt");
};

var view_practice = function(req, res, next) {
    var prac_num = req.query['id'];
    db.one("SELECT * from practices where id = $1 limit 1", [prac_num]).then(function(practice) {
        return db.many("SELECT * from replies where practiceid = $1", [prac_num]).then(function(replies) {
            var starttime = practice.starttime;
            var endtime = practice.endtime;
            var timestring = printTime(starttime, endtime);
            var ins = replies.filter(function(row) {
                return row.status == 'in';
            });
            var outs = replies.filter(function(row) {
                return row.status == 'out';
            });

            return db.many("select distinct username from replies").then(function(usernames) {
                var out_usernames = outs.map(function(a) { return a.username; });
                var in_usernames = ins.map(function(a) { return a.username; });
                var excluded = [];
                var all = usernames.filter(function(row) {
                    return in_usernames.indexOf(row.username) == -1 &&
                        out_usernames.indexOf(row.username) == -1 &&
                        excluded.indexOf(row.username) == -1;
                        });
                respondWithPage(res, "practice_page.html", { time: timestring, practice: practice, ins: ins, outs: outs, unknown: all });
            });
        });
    }).catch(function(err) {
        res.status(400).send("Can't load practice. Err: " + err);
    }).done();
};

var status_func = function(type) {
    return function (req, res, next) {
        var userName = req.body.user_name;
        var message = req.body.text;
        if (type == 'out' && !message) {
            return res.status(200).send("You must supply a reason why you can't make it.");
        }
        db.one("SELECT * FROM practices ORDER BY starttime DESC LIMIT 1").then(function(practice) {
            var id = practice.id;
            return db.oneOrNone("SELECT username from replies where practiceid = $1 and username = $2", [id, userName]).then(function(reply) {
                if (reply) {
                    return db.none("UPDATE replies SET status = $1, message = $2 where practiceid = $3 and username = $4", [type, message, id, userName]);
                } else {
                    return db.none("INSERT INTO REPLIES VALUES ($1,$2,$3,$4)", [id,userName,message,type]);
                }
            });
        }).catch(function(err) {
            next(err);
        }).then(function() {
            return res.status(200).send("You're " + type + "!").end();
        }).done();
    };
};

/* Web app */
var app = express();
var port = process.env.PORT || 3000;

// body parser middleware
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(__dirname + '/public'));

// error handler
app.use(function(err, req, res, next) {
  console.error(err.stack);
  res.status(400).send(err.message);
});

app.listen(port, function() {
  console.log('Slack bot listening on port ' + port);
});

app.get('/', function(req, res) { res.status(200).send('Nothing here...'); });
app.post('/practice', practice);
app.get('/practice', view_practice);
app.post('/in', status_func('in'));
app.post('/out', status_func('out'));
