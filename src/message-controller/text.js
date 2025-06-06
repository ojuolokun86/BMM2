function getGroupInfoMsg({ groupName, remoteJid, owner, memberCount, adminCount, groupDesc, adminList }) {
    return `📋 *Group Info*
━━━━━━━━━━━━━━━━━━
📛 *Name:* ${groupName}
🆔 *ID:* ${remoteJid}
👑 *Owner:* @${owner.split('@')[0]}
👥 *Members:* ${memberCount}
🛡️ *Admins:* ${adminCount}

📝 *Description:*
${groupDesc}

📃 *Admin List:*
${adminList}
━━━━━━━━━━━━━━━━━━`;
}

function getAntiLinkStatusMsg({ settings, bypassUsersList, groupName, groupId }) {
    return `🛡️ *Anti-Link Settings*
━━━━━━━━━━━━━━━━━━━━
📛 *Group Name:* ${groupName || 'Unknown'}
🆔 *Group ID:* ${groupId || 'Unknown'}
✅ *Enabled:* ${settings.antilink_enabled ? 'Yes' : 'No'}
⚠️ *Warning Count:* ${typeof settings.warning_count === 'number' ? settings.warning_count : 3}
👮 *Bypass Admin:* ${settings.bypass_admin ? 'Yes' : 'No'}

🙅 *Bypass Users:*
${bypassUsersList}
━━━━━━━━━━━━━━━━━━━━`;
}

function getWarningListMsg(warnings, { groupName = 'Unknown', groupAdmin = 'Unknown', groupId = 'Unknown' } = {}) {
    if (!warnings || warnings.length === 0) {
        return { text: 'ℹ️ No warnings found for this group.', mentions: [] };
    }
    const mentions = [];
    const lines = warnings.map((warning, index) => {
        const userJid = warning.user_id;
        mentions.push(userJid);
        const userTag = `@${userJid.split('@')[0]}`;
        return `${index + 1}. ${userTag} - ${warning.warning_count} warning${warning.warning_count !== 1 ? 's' : ''} (${warning.reason || 'No reason provided'})`;
    });
    return {
        text:
`*⚠️ Warning List for Group:*
━━━━━━━━━━━━━━━━━━━━
📛 *Group Name:* ${groupName}
👑 *Group Admin:* @${groupAdmin.split('@')[0]}
🆔 *Group ID:* ${groupId}

${lines.join('\n')}
━━━━━━━━━━━━━━━━━━━━`,
        mentions
    };
}

module.exports = {
    getGroupInfoMsg,
    getAntiLinkStatusMsg,
    getWarningListMsg,
};
