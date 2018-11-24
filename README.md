## Cheetah Downloader

This is the package at the core of Cheetah app. This is the one that acutally downloads a file with multiple parallel connections.

### Install

Yarn or NPM, you know the drill.

```
yarn add cheetah-downloader
```


### Usage

```js
const downloader = require('cheetah-downloader')
const url = 'http://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4'
const targetFolder = '~/Downloads'

const newDownload = downloader(url, targetFolder)

newDownload.on('meta', meta => {
  console.log('meta:', meta)
}).on('progress', progress => {
  console.log(progress)
}).on('complete', info => {
  console.log(info)
})
.start()
```

#### Constructor

```js
const newDownload = downloader(url, targetFolder [, opts])
```

##### Parameters:

 - *url*: (string, required) - The URL of the file to download
 - *targetFolder*: (string, required) - Where to save the file. Must be an absolute path. Existing file with same name in this folder will be overwritten.
 - *opts*: (object, optional) -
    - *connections*: (int) - How many parallel connections should be made. `5` is default.
    - *interval*: (int) - interval of progress update in `ms`. Default is `500`
    - *tempDir*: (string) - Where to save the temporary files. Make sure you have write access to this folder. E.g: `__dirname + '/temp/'`. __Don't forget the trailing slash!__.
    - *saveAs*: (string) - The name you would like the file to be saved as. Helpful when you want to save the file with different name than the server provided. You can also use [file-saveable](https://github.com/cheetahapp/file-saveable) to determine a name for the file.
    - *UA*: (string) - The user agent string you'd like to use while downloading. Default is:
    `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36`

#### Methods:

Following methods are available on its instance:

 - `on`: Use it to listen to different events emitted during the life-cycle of download.
 - `getMeta`: Get the metadata about the file. It does not return anything, you'll have to listen to `meta` event.
 - `start`: Start download
 - `pause`: Pause it
 - `resume`: Resume it
 - `abort`: Cancel it

> These method do not accept any arguments and all of them return the instance.

#### Events

Following events are emitted through out the life-cycle of a download. The callback to these events is also passed some data related to the event:

 - `meta`: When some meta is available regarding the file.
 It provides the data similar to this:
 ```js
{
  size: '64657027', // bytes
  type: 'video/mp4',
  saveAs: 'BigBuckBunny_320x180.mp4',
  resumable: true // this also indicates if the download supports multiple connections
}
 ```

 - `progress`: Emitted after every `opts.interval` with overall download progress.
 E.g data:
 ```js
{
  speed: '579.15', // KB/S
  timeRemaining: '2.09', // Sec
  percent: '99.500' // duh!
}
 ```

 - `chunkProgress`: Emitted for every `opts.chunks`.
 E.g data:
 ```js
{
  index: 0, // index of chunk (0 - opts.chunks-1)
  speed: '234.10', // KB/s
  percent: '0.042',
  timeRemaining: '51.69' // Sec
}
 ```

 - `complete`: Emitted when the download is complete.
 E.g data:
```js
{
  path: '/Users/local/Downloads/BigBuckBunny_320x180.mp4'
  // the final path
}
```

 - `error`: If something goes wrong anywhere. E.g data:
```js
{
  error: error, // error stack from library
  code: 'CHUNK_FAIL', // code
  msg: 'Could not join the downloaded parts together.' // human-readable explanation
}
```

Following `code`s can be expected from this event:
- `CHUNK_FAIL`: After downloading the file in chunks, it was not able to put them togther in 1 file. Probably due to some filesystem/permission error.
- `DOWNLOAD_FAIL`: Some error interrupted the download-in-progress
- `OUT_OF_REACH`: Could not access the file from given URL. Could be the server rejecting the request, or internet connection issue.


### License

[MIT](./LICENSE). Copyright (c) [Moin Uddin](https://moin.im)
