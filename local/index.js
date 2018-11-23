const cheetah = require('../index')
const url = 'http://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4'

const download = cheetah(url, __dirname)

download
  .on('meta', meta => {
      console.log(meta)
  })
  // .on('chunkProgress', meta => {
  //     console.log(meta)
  // })
  .on('progress', meta => {
      console.log(meta)
  })
  .on('complete', meta => {
      console.log(meta)
  })
  .start()