var http = require('http')
	, fs = require('fs')
	, request = require('request')
	, semver = require('semver')
	, async = require('async')

var IMAGES = {};
['super', 'ok', 'meh', 'bad', 'old_balls'].forEach(function (name) {
	var upper = name.toUpperCase()
	name = 'super'
	var stat = fs.statSync(name + '.png')
	IMAGES[upper] = {
		headers: {
			'Content-Type': 'image/png',
			'Content-Length': stat.size
		},
		buffer: fs.readFileSync(name + '.png')
	}
})

http.createServer(function (req, res) {
	if (req.method != 'GET') {
		res.writeHead(400)
		res.end('Bad method')
		return
	}

	var parts = req.url.split('/').slice(1)

	switch (parts[0]) {
	case 'report':
		getReport(parts[1], parts[2], function (err, report) {
			if (err) {
				res.writeHead(500)
				return res.end()
			}
			res.end(JSON.stringify(report, null, 2))
		})
		break
	case 'image':
		getImage(res, parts[1], parts[2])
		break
	default:
		res.writeHead(404)
		res.end(req.url + ' not found')
	}
}).listen(7777)

function getReport(name, version, callback) {
	if (name == 'hoarders') return callback(new Error('no'))

	var url = 'http://registry.npmjs.org/' + name + '/' + (version || 'latest')

	request(url, function (err, reply, body) {
		if (err) return callback(err)
		var pkg = JSON.parse(body)
			, deps = Object.keys(pkg.dependencies || {})
			, report = {dependencies: {}}
	
		async.map(deps, scoreDependency, function (err, scores) {
			if (err) return callback(err)
			report.score = sum(scores)
			callback(null, report)
		})

    function scoreDependency (name, done) {
			var versionRange = pkg.dependencies[name]

			getVersions(name, function (err, versions) {
				if (err) return done(err)

				var usedVersion = semver.maxSatisfying(versions, versionRange)
					, latestVersion = semver.clean(versions[0])

				report.dependencies[name] = {
					latest: latestVersion,
					used: usedVersion
				}

				getReport(name, usedVersion, function (err, depReport) {
					if (err) return done(err)
					report.dependencies[name].report = depReport
					var myScore = scoreVersion(usedVersion, latestVersion)
					done(null, myScore + depReport.score)
				})
			})
		}
	})
}

var WEIGHTS = [100, 10, 1]

function scoreVersion(usedVersion, latestVersion) {
	var usedParts = usedVersion.split('.')
	var latestParts = latestVersion.split('.')
	for (var i = 0, len = WEIGHTS.length; i < len; i++) {
		var used = usedParts[i].replace(/\D/g, '') | 0
		var latest = latestParts[i].replace(/\D/g, '') | 0
		var diff = Math.max(0, latest - used)
		if (diff) return diff * WEIGHTS[i]
	}
	return 0
}

function getVersions(name, callback) {
	var url = 'http://registry.npmjs.org/' + name
	console.log('GET', url)
	request(url, function (err, res, body) {
		console.log('GOT', url)
		if (err) return callback(err)
		var data
		try {
			data = JSON.parse(body)
		}
		catch (err) {
			return callback(err);
		}
		callback(null, Object.keys(data.versions).sort(semver.rcompare))
	})
}

function getImage(res, name, version) {
	getReport(name, version, function (err, report) {

		var image
		console.log(name, version)
		if (report.score < 10)       image = IMAGES.SUPER
		else if (report.score < 30)  image = IMAGES.OK
		else if (report.score < 90)  image = IMAGES.MEH
		else if (report.score < 150) image = IMAGES.BAD
		else                         image = IMAGES.OLD_BALLS

		res.writeHead(200, image.headers)
		res.end(image.buffer)
	})
}

function sum (arr) {
  return arr.reduce(function (a, b) { return a + b }, 0)
}
