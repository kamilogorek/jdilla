const SC = require('soundcloud')
const io = require('socket.io-client')
const socket = io()
const xhr = require('xhr')

const env = require('../env.js')
const SOUNDCLOUD_CLIENT_ID = process.env.SOUNDCLOUD_CLIENT_ID || env.SOUNDCLOUD_CLIENT_ID

if (!SOUNDCLOUD_CLIENT_ID) throw new Error('Please provide SOUNDCLOUD_CLIENT_ID as your env variable')

SC.initialize({
  client_id: SOUNDCLOUD_CLIENT_ID
})

var player
const artistEl = document.querySelector('#artist')
const trackEl = document.querySelector('#track')
const stateEl = document.querySelector('#state')

function streamTrack (track) {
  SC.stream(`/tracks/${track.id}`).then((stream) => {
    player = stream
    artistEl.innerText = track.user.username
    trackEl.innerText = track.title
    stateEl.innerText = 'Playing'
    player.play()
    player.on('finish', getNextTrack)
  }).catch((error) => {
    console.error(error)
  })
}

function resetSplash () {
  artistEl.innerText = 'No tracks available'
  trackEl.innerText = ''
  stateEl.innerText = ''
}

socket.on('play', () => {
  if (!player) return
  player.play()
  stateEl.innerText = 'Playing'
})

socket.on('pause', () => {
  if (!player) return
  player.pause()
  stateEl.innerText = 'Paused'
})

socket.on('next', (track) => {
  if (!track) {
    if (player) player.pause()
    resetSplash()
  } else {
    streamTrack(track)
  }
})

socket.on('stream', (track) => streamTrack(track))

function processTrackResponse (err, resp, body) {
  if (err) return console.error(err)
  try {
    let track = JSON.parse(body)
    if (!track) {
      if (player) player.pause()
      return resetSplash()
    }
    streamTrack(track)
  } catch (e) {
    console.error(e)
  }
}

window.next = getNextTrack

function getNextTrack () {
  xhr({ uri: '/next' }, processTrackResponse)
}

function getCurrentTrack () {
  xhr({ uri: '/current' }, processTrackResponse)
}

getCurrentTrack()
