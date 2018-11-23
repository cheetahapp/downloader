// Support: Node >= 6.4.0

function cheetahDownloader (FILEURL, TARGETFOLDER, OPTS = {}) {
  if (!TARGETFOLDER) {
    throw Error('Cheetah: TARGETFOLDER is required as second parameter.')
  } else if (typeof TARGETFOLDER !== 'string') {
    throw Error('Cheetah: Second parameter should be string.')
  }

  const fs = require('fs')
  const URL = require('url')
  const path = require('path')
  const rimraf = require('rimraf')
  const mkdirp = require('mkdirp')
  const request = require('request')
  const progress = require('request-progress')

  // Make sure the target folder exists
  fs.accessSync(TARGETFOLDER, fs.W_OK)  // Node will throw an exception if path does not exists

  const THREADS = OPTS.connections || 5
  const DIR_TEMP = `${OPTS.tempDir || __dirname}/temp/`  // for all the downloads
  const UID = Math.random().toString(36).substr(2, 4)   // 4 letter random aplha-numeric string
  const PATH_TEMP = `${DIR_TEMP}${UID}/`  // for current download
  const INTERVAL = OPTS.interval || 500
  const UA = OPTS.UA || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36'

  // Make sure the temp folder is writeable
  fs.accessSync(DIR_TEMP, fs.W_OK)  // Node will throw an exception if path does not exists

  const STATUS = {
    init: 0,
    meta: 1,
    downloading: 2,
    paused: 3,
    combining: 4,
    ended: 5
  }

  let targetPath // final path with file name
  const instance = {}
  const eventStore = {
    meta: [],
    error: [],
    progress: [],
    complete: [],
    chunkProgress: []
  }
  const rangeStore = [] // store data about each chunk being downloaded
  const currentFile = {
    status: STATUS.init
  }

  const trigger = (evt, data) => {
    eventStore[evt].forEach(callback => callback(data))
  }

  const getFilename = type => {
    const parsed = URL.parse(FILEURL)
    return path.basename(parsed.pathname)
  }

  const applyToRequest = action => {
    rangeStore.forEach(req => {
      if (action === 'pause' || action === 'abort') {
        req.request.abort()
      } else { // resume
        sendRangeRequest(FILEURL, {
          to: req.state.size.total,
          from: req.state.size.transferred
        }, req.index)
      }
    })
  }

  const markEnded = (cb = () => {}) => {
    // cleanup temp directory.
    rimraf(PATH_TEMP, cb)
    currentFile.status = STATUS.ended
  }

  const markComplete = () => {
    trigger('complete', {
      path: targetPath
    })
    markEnded()
  }

  const appendChunk = (flag = 'r+') => {
    if (rangeStore.length) {
      const chunk = rangeStore.pop()
      const i = chunk.index

      fs.createReadStream(PATH_TEMP + 'chunk-' + i)
      .on('error', error => {
        trigger('error', {
          error: error,
          code: 'CHUNK_FAIL',
          msg: 'Could not join the downloaded parts together.'
        })
        markEnded()
      })
      .on('end', appendChunk)
      .pipe(fs.createWriteStream(targetPath, {
        flags: flag,
        start: chunk.range.from
      }))
    } else { // all ended
      markComplete()
    }
  }

  const putChunksTogether = () => { // joins all the chunks into final file
    fs.access(targetPath, err => {
      appendChunk(err ? 'w' : 'r+')
    })
  }

  const chunkComplete = () => {
    if (currentFile.status >= STATUS.combining) {
      return
    }

    let completed = 0

    for (let i = 0; i < rangeStore.length; i++) {
      if (rangeStore[i].complete) {
        completed++
      }
    }

    if (completed === rangeStore.length) { // all parts are done
      putChunksTogether()
      currentFile.status = STATUS.combining
    }
  }

  const progessInterval = () => {
    if (currentFile.status !== STATUS.downloading) {
      return
    }

    let state
    let dSize = 0
    let dTime = 0
    let dSpeed = 0
    const n = rangeStore.length

    for (var i = 0; i < n; i++) {
      state = rangeStore[i].state
      if (state) { // could be undefined initially
        dSpeed += state.speed
        dTime += state.time.remaining
        dSize += state.size.transferred
      }
    }

    trigger('progress', {
      speed: (dSpeed / 1024).toFixed(2), // kb/s
      timeRemaining: (dTime / THREADS).toFixed(2), // sec
      percent: ((dSize / currentFile.size) * 100).toFixed(3)
    })

    setTimeout(progessInterval, INTERVAL)
  }

  const reportChunkProgress = (index, progress) => {
    trigger('chunkProgress', {
      index: index,
      speed: (progress.speed / 1024).toFixed(2), // kb/s
      percent: progress.percent.toFixed(3),
      timeRemaining: (progress.time.remaining || 0).toFixed(2) // sec
    })
  }

  const getRange = (number, n = 5) => {
    let temp
    let lastByte = 0
    const ranges = []
    const f1 = number / n

    for (let i = 1; i <= n; i++) {
      temp = f1 * i
      ranges.push({
        to: Math.floor(temp),
        from: Math.ceil(lastByte)
      })
      lastByte = temp
    }

    return ranges
  }

  const sendRangeRequest = (url, range, index) => {
    const req = request.get(url, {
      gzip: true,
      encoding: null,
      followRedirect: true,
      headers: {
        'User-Agent': UA,
        Range: `bytes=${range.from}-${range.to}`
      }
    })

    rangeStore[index] = rangeStore[index] || {}
    rangeStore[index].range = range
    rangeStore[index].index = index
    rangeStore[index].request = req

    const prog = progress(req)
    .on('error', function (err) {
      trigger('error', {
        error: err,
        code: 'DOWNLOAD_FAIL',
        msg: 'Some error occurred while downloading a part of file.'
      })
      markEnded()
    })
    .on('progress', function (state) {
      rangeStore[index].state = state
      reportChunkProgress(index, state)
    })
    .on('end', function () {
      if (currentFile.status !== STATUS.paused) {
        rangeStore[index].complete = true
        chunkComplete()
      }
    })
    fs.access(PATH_TEMP + 'chunk-' + index, function (err) {
      prog.pipe(fs.createWriteStream(PATH_TEMP + 'chunk-' + index, {
        flags: err ? 'w' : 'r+'
      }))
    })
  }

  const handleError = () => {}

  const sendHeadRequest = (url, cb, errCB) => {
    const reqOpts = {
      url: url,
      timeout: 10000,
      strictSSL: false,
      followRedirect: true,
      headers: {
        'User-Agent': UA
      }
    }

    request.head(reqOpts)
    .on('response', cb)
    .on('error', function (err, res) {
      handleError(err) // eslint fix
      if (res.code === 405) { // Method not allowed = HEAD
        const getReq = request.get(reqOpts) // Try GETting it
        .on('response', res => {
          cb(res)
          getReq.abort() // just needed the headers
        })
        .on('error', errCB)
      }
    })
  }

  const getMeta = () => {
    // check to see if file exists, whats its size and does it accepts ranges.
    sendHeadRequest(FILEURL, function (res) {
      if (res.statusCode === 200) {
        const type = res.headers['content-type']
        const range = res.headers['accept-ranges']
        const size = res.headers['content-length']

        const resumable = !!(range && range !== 'none')

        currentFile.size = size
        currentFile.status = STATUS.meta
        currentFile.resumable = resumable

        const filename = getFilename(type)
        targetPath = path.join(TARGETFOLDER, OPTS.saveAs || filename)

        trigger('meta', {
          size: size,
          type: type,
          saveAs: filename,
          resumable: resumable
        })
      } else if (res.statusCode >= 400) {
        trigger('error', {
          error: res,
          code: 'OUT_OF_REACH',
          msg: 'Some error occurred in accessing the file.'
        })
      }
    }, function (err) {
      trigger('error', {
        error: err,
        code: 'OUT_OF_REACH',
        msg: 'Some error occurred in accessing the file.'
      })
    })
  }

  instance.start = () => {
    if (currentFile.status < STATUS.meta) {
      prepare()
      return instance.on('meta', instance.start) // get a callback when meta is available.
    }

    if (currentFile.resumable) {
      getRange(currentFile.size, THREADS).forEach(function (r, i) {
        sendRangeRequest(FILEURL, r, i)
      })
    } else {
      sendRangeRequest(FILEURL, {
        from: 0,
        to: currentFile.size
      }, 0)
    }

    currentFile.status = STATUS.downloading
    progessInterval() // start reporting
    return instance
  }

  instance.pause = () => {
    currentFile.status = STATUS.paused
    applyToRequest('pause')
    return instance
  }

  instance.resume = () => {
    if (currentFile.status === STATUS.paused) {
      currentFile.status = STATUS.downloading
      progessInterval()
      applyToRequest('resume')
    }
    return instance
  }

  instance.abort = () => {
    applyToRequest('abort')
    markEnded()
    return instance
  }

  process.on('SIGINT', function () { // cleanup on CTRL+C
    markEnded(process.exit)
  })

  instance.on = (evt, evtCB) => {
    if (eventStore[evt] && evtCB) {
      eventStore[evt].push(evtCB)
    }

    return instance
  }

  instance.getMeta = getMeta

  const prepare = () => {
    getMeta()
    mkdirp(PATH_TEMP)
  }

  return instance
}

module.exports = cheetahDownloader
