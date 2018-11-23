const assert = require('assert')
const cheetah = require('../index')
const url = 'http://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_320x180.mp4'

describe('Constructor', () => {

  it('throws error when 2nd param is not provided', () => {
    assert.throws(
      () => {
        cheetah(url)
      },
      Error
    )
  })

  it('does not throw an error when 2nd param is provided', () => {
    assert.doesNotThrow(
      () => {
        cheetah(url, __dirname)
      },
      Error
    )
  })

})