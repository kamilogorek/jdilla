const RtmClient = require('slack-client').RtmClient
const RTM_EVENTS = require('slack-client').EVENTS.API.EVENTS

const token = process.env.SLACK_API_TOKEN

if (!token) throw new Error('Please provide SLACK_API_TOKEN as your env variable')

const rtm = new RtmClient(token, {
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
          return `${index + 1}. ${track}`
        }).join('\n')
        rtm.sendMessage(queue || 'No tracks in a queue', message.channel)
        break
      }
    case 'add':
      {
        channels[channel].queue.push(messageData)
        rtm.sendMessage(`${messageData} has been added to the queue`, message.channel)
        break
      }
    case 'remove':
      {
        const trackPosition = channels[channel].queue.indexOf(messageData)
        if (trackPosition === -1) {
          rtm.sendMessage(`Sorry, ${messageData} has not been found in the queue`, message.channel)
          return
        }
        channels[channel].queue.splice(trackPosition, 1)
        rtm.sendMessage(`${messageData} has been removed from the queue`, message.channel)
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
        rtm.sendMessage(`Track skipped. Next track: ${nextTrack}`, message.channel)
        break
      }
  }
})

rtm.start()
