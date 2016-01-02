var datejs = require('datejs');

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


module.exports = parseTimes;
