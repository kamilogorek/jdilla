const request = require('request')

const RtmClient = require('slack-client').RtmClient
const RTM_EVENTS = require('slack-client').EVENTS.API.EVENTS

const SLACK_TOKEN = process.env.SLACK_API_TOKEN
const SOUNDCLOUD_CLIENT_ID = process.env.SOUNDCLOUD_CLIENT_ID

if (!SLACK_TOKEN) throw new Error('Please provide SLACK_API_TOKEN as your env variable')
if (!SOUNDCLOUD_CLIENT_ID) throw new Error('Please provide SOUNDCLOUD_CLIENT_ID as your env variable')

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

const rtm = new RtmClient(SLACK_TOKEN, {
  logLevel: 'debug'
})

const model = {
  queue: [],
  currentTrack: '',
  playing: false,
  paused: false
}

const channels = {}

const commands = ['list', 'add', 'remove', 'play', 'pause', 'stop', 'next']
const commandsRequiringData = ['add', 'remove']

rtm.on(RTM_EVENTS.MESSAGE, (message) => {
  // J Dilla Trigger: J
  if (!message.text.match(/^J .*/i)) return

  const channel = message.channel
  const partitionedMessage = message.text.split(' ')
  const messageCommand = partitionedMessage[1]
  const messageData = partitionedMessage.slice(2).join(' ')

  if (!~commands.indexOf(messageCommand)) {
    rtm.sendMessage('Sorry mate, incorrect command. Peace.', message.channel)
    return
  }

  if (~commandsRequiringData.indexOf(messageCommand) && !messageData) {
    rtm.sendMessage(`Got your command (${messageCommand}), but you didn't specify data mate!`, message.channel)
    return
  }

  // rtm.sendMessage(`Command: ${messageCommand}; Data: ${messageData};`, message.channel)

  if (!channels[channel]) {
    channels[channel] = Object.assign({}, model)
  }

  switch (messageCommand) {
    case 'list':
      {
        const queue = channels[channel].queue.map((track, index) => {
          return `${index + 1}. ${track.title}`
        }).join('\n')
        const response = queue ? 'Tracks list:\n' + queue : 'No tracks in a queue'
        rtm.sendMessage(response, message.channel)
        break
      }
    case 'add':
      {
        kindlyAskSoundCloud('tracks', {
          q: messageData
        }).then((tracks) => {
          try {
            const song = JSON.parse(tracks)[0]
            channels[channel].queue.push(song)
            rtm.sendMessage(`"${song.title}" has been added to the queue`, message.channel)
          } catch (e) {
            rtm.sendMessage(`Sorry, something went wrong while trying to add "${messageData}"`, message.channel)
          }
        })
        break
      }
    case 'remove':
      {
        const trackPosition = channels[channel].queue.indexOf(messageData)
        if (trackPosition === -1) {
          rtm.sendMessage(`Sorry, "${messageData}" has not been found in the queue`, message.channel)
          return
        }
        channels[channel].queue.splice(trackPosition, 1)
        rtm.sendMessage(`"${messageData}" has been removed from the queue`, message.channel)
        break
      }
    case 'play':
      {
        channels[channel].playing = true
        channels[channel].paused = false
        rtm.sendMessage('Playback started', message.channel)
        break
      }
    case 'pause':
      {
        channels[channel].playing = false
        channels[channel].paused = true
        rtm.sendMessage('Playback paused', message.channel)
        break
      }
    case 'stop':
      {
        channels[channel].playing = false
        channels[channel].paused = false
        rtm.sendMessage('Playback stopped', message.channel)
        break
      }
    case 'next':
      {
        if (channels[channel].queue.length === 0) {
          rtm.sendMessage('No tracks in a queue', message.channel)
          return
        }

        const nextTrack = channels[channel].queue.shift()
        rtm.sendMessage(`Track skipped. Next track: "${nextTrack}"`, message.channel)
        break
      }
  }
})

rtm.start()
