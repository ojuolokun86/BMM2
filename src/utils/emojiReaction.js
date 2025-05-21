const commandEmojis = {
    // General Commands
    menu: '📜',
    info: 'ℹ️',
    ping: '🏓',
    about: '📖',
    restart: '🔄',

    // Customization Commands
    prefix: '🔤',
    tagformat: '🎨',

    // Group Commands
    tagall: '📢',
    setmode: '⚙️',
    antidelete: '🛡️',
    warn: '⚠️',
    resetwarn: '♻️',
    listwarn: '📋',
    warncount: '🔢',
    welcome: '👋',
    setwelcome: '✍️',
    group: '🏢',
    poll: '📊',
    endpoll: '🛑',
    kick: '🚪',
    add: '➕',
    promote: '⬆️',
    demote: '⬇️',
    clear: '🧹',
    mute: '🔒',
    unmute: '🔓',
    kickall: '🚪',
    announce: '📢',
    leave: '🚪',

    // Utility Commands
    delete: '🗑️',
    fun: '🎉',
    view: '👁️',
    status: '👀',
    setname: '✏️',
    setpic: '🖼️',
    setstatus: '✏️',
    presence: '🔄',
    seen: '👁️',
    bug: '🪲',
    protect: '🛡️',
    deleteit: '🗑️',
    block: '🚫',
    unblock: '✅',

    // Protection Commands
    antilink: '🔗',

    // Community & Group Commands
    create: '🏢',
    destroy: '❌',
    admin: '📢',

    // Fun Commands (expanded)
    sticker: '🖼️',
    emoji: '😎',
    fight: '🥊',
    kill: '💀',
    cry: '😭',
    angry: '😡',
    humble: '🙏',
    laugh: '😂',
    dance: '💃',
    love: '❤️',
    slap: '🤚',
    hug: '🤗',
    pat: '🫶',
    kiss: '😘',
    poke: '👊',
    cuddle: '🥰',
    wave: '👋',
    kickfun: '🦶',
    bite: '🦷',
    tickle: '🫳',
    feed: '🤲',
    highfive: '🤝',
    facepalm: '🤦',
    blush: '😳',
    bored: '😐',
    smug: '😏',
    pout: '😶',
    smile: '😃',
    stare: '👀',
    think: '🤔',
    shrug: '🤷',
    thumbsup: '👍',
    yeet: '🥏',
    shoot: '🔫',
    baka: '😂',

    // Mini-games & fun
    flip: '🪙',
    roll: '🎲',
    quote: '💬',
    joke: '😂',
};

const getEmojiForCommand = (command) => {
    const randomEmojis = ['👍', '🎉', '✨', '🔥', '✅', '💡', '🎯'];
    return commandEmojis[command] || randomEmojis[Math.floor(Math.random() * randomEmojis.length)];
};

module.exports = { getEmojiForCommand };