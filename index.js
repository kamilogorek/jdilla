const path = require('path')
const express = require('express')
const request = require('request')
const _ = require('lodash')
const slackClient = require('slack-client')

const PORT = process.env.PORT || 8000

const env = require('./env.js')
const SLACK_TOKEN = process.env.SLACK_API_TOKEN || env.SLACK_TOKEN
const SOUNDCLOUD_CLIENT_ID = process.env.SOUNDCLOUD_CLIENT_ID || env.SOUNDCLOUD_CLIENT_ID

if (!SLACK_TOKEN) throw new Error('Please provide SLACK_API_TOKEN as your env variable')
if (!SOUNDCLOUD_CLIENT_ID) throw new Error('Please provide SOUNDCLOUD_CLIENT_ID as your env variable')

const server = express()
const slackSocket = new slackClient.RtmClient(SLACK_TOKEN, {
  logLevel: 'debug'
})

/**
 * SoundCloud
 ********************************/

function kindlyAskSoundCloud (endpoint, options) {
  return new Promise((resolve, reject) => {
    request({
      method: 'GET',
      uri: `https://api.soundcloud.com/${endpoint}`,
      qs: Object.assign({
        client_id: SOUNDCLOUD_CLIENT_ID
      }, options)
    }, (error, response, body) => {
      if (error) return reject(error)
      resolve(body)
    })
  })
}

/**
 * Slack
 ********************************/

const state = {
  queue: [],
  currentTrack: null,
  playing: false
}

const commands = ['list', 'find', 'add', 'remove', 'play', 'pause', 'next', 'skip', 'help']
const commandsRequiringData = ['add', 'remove']

slackSocket.on(slackClient.EVENTS.API.EVENTS.MESSAGE, (message) => {
  // J Dilla Trigger: J
  if (!message.text.match(/^J .*/i)) return

  const channel = message.channel
  const partitionedMessage = message.text.split(' ')
  const messageCommand = partitionedMessage[1]
  const messageData = partitionedMessage.slice(2).join(' ')

  if (!~commands.indexOf(messageCommand)) {
    slackSocket.sendMessage('Sorry mate, incorrect command. Peace.', channel)
    return
  }

  if (~commandsRequiringData.indexOf(messageCommand) && !messageData) {
    slackSocket.sendMessage(`Got your command (${messageCommand}), but you didn't specify data mate!`, channel)
    return
  }

  // slackSocket.sendMessage(`Command: ${messageCommand}; Data: ${messageData};`, channel)

  var response

  switch (messageCommand) {
    case 'help':
      {
        response = '' +
          'How can I help you m8?:\n' +
          '\`\`\`\n' +
          'list – display tracks queue\n' +
          'find – search for a track on SoundCloud and get it\'s ID\n' +
          'add — add track to the queue by ID\n' +
          'remove — remove track from the queue by ID\n' +
          'play – start/resume playback\n' +
          'pause – pause playback\n' +
          'next/skip – skip current song\n' +
          'help – display this great manual\n' +
          '\`\`\`'
        slackSocket.sendMessage(response, channel)
        break
      }
    case 'list':
      {
        var queue = state.queue.map((track, index) => {
          return `${index + 1}. ${track.user.username} — ${track.title} \`${track.id}\``
        }).join('\n')
        response = queue ? 'Tracks list:\n' + queue : 'No tracks in a queue'
        slackSocket.sendMessage(response, channel)
        break
      }
    case 'find':
      {
        kindlyAskSoundCloud('tracks', {
          q: messageData
        }).then((tracks) => {
          try {
            var foundItems = JSON.parse(tracks).map((track, index) => {
              return `${index + 1}. ${track.user.username} — ${track.title} \`${track.id}\``
            }).join('\n')
            response = foundItems ? 'Tracks found:\n' + foundItems : 'No tracks found'
            slackSocket.sendMessage(response, channel)
          } catch (e) {
            slackSocket.sendMessage(`Sorry, something went wrong while trying to find "${messageData}"`, channel)
          }
        })
        break
      }
    case 'add':
      {
        kindlyAskSoundCloud(`tracks/${messageData}`).then((track) => {
          try {
            track = JSON.parse(track)
            if (track.errors) {
              slackSocket.sendMessage(`SongID: \`${messageData}\` has not been found`, channel)
              return
            }
            if (!state.currentTrack) {
              state.currentTrack = track
              slackSocket.sendMessage(`No previous tracks available. "${track.user.username} — ${track.title}" is playing straight away!`, channel)
              io.emit('stream', track)
              return
            }
            state.queue.push(track)
            slackSocket.sendMessage(`"${track.user.username} — ${track.title}" has been added to the queue`, channel)
          } catch (e) {
            slackSocket.sendMessage(`Sorry, something went wrong while trying to add "${messageData}"`, channel)
          }
        })
        break
      }
    case 'remove':
      {
        var trackPosition = _.findIndex(state.queue, (track) => {
          return parseInt(track.id, 10) === parseInt(messageData, 10)
        })
        if (trackPosition === -1) {
          slackSocket.sendMessage(`Sorry, SongID \`${messageData}\` has not been found in the queue`, channel)
          return
        }
        var removedTrack = state.queue.splice(trackPosition, 1)[0]
        slackSocket.sendMessage(`"${removedTrack.user.username} — ${removedTrack.title}" has been removed from the queue`, channel)
        break
      }
    case 'play':
      {
        state.playing = true
        io.emit('play')
        slackSocket.sendMessage('Playback started', channel)
        break
      }
    case 'pause':
      {
        state.playing = false
        io.emit('pause')
        slackSocket.sendMessage('Playback paused', channel)
        break
      }
    case 'next':
    case 'skip':
      {
        if (state.queue.length > 0) {
          state.currentTrack = state.queue.shift()
          slackSocket.sendMessage(`Track skipped. Next track: "${state.currentTrack.user.username} — ${state.currentTrack.title} \`${state.currentTrack.id}\`"`, channel)
        } else {
          state.currentTrack = null
          slackSocket.sendMessage('No tracks in a queue', channel)
        }

        io.emit('next', state.currentTrack)
        break
      }
  }
})

/**
 * Server
 ********************************/

const http = require('http').Server(server)
const io = require('socket.io')(http)

server.use(express.static('public'))

server.get('/current', (req, res) => {
  res.send(state.currentTrack)
})

server.get('/next', (req, res) => {
  if (state.queue.length > 0) {
    state.currentTrack = state.queue.shift()
  } else {
    state.currentTrack = null
  }

  res.send(state.currentTrack)
})

server.get('*', (req, res) => {
  if (req.path !== '/') {
    res.redirect('/')
  } else {
    res.sendFile('index.html', {
      root: path.join(__dirname, 'public')
    })
  }
})

/**
 * Startup
 ********************************/

slackSocket.on(slackClient.EVENTS.CLIENT.RTM.RTM_CONNECTION_OPENED, () => {
  http.listen(PORT, () => console.log(`Server listening on port ${PORT}!`))
})

slackSocket.start()
