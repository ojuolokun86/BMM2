const supabase = require('../supabaseClient'); // Import Supabase client

/**
 * Get the format_response setting for a user.
 * @param {string} userId - The user's ID.
 * @returns {Promise<boolean>} - The format_response setting (true or false).
 */
const getFormatResponseSetting = async (userId) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('format_response')
            .eq('user_id', userId)
            .single();

        if (error) {
            console.error(`❌ Failed to fetch format_response setting for user ${userId}:`, error);
            return true; // Default to true if an error occurs
        }

        return data.format_response ?? true; // Default to true if null
    } catch (error) {
        console.error(`❌ Unexpected error fetching format_response setting for user ${userId}:`, error);
        return true; // Default to true if an unexpected error occurs
    }
};

/**
 * Update the format_response setting for a user.
 * @param {string} userId - The user's ID.
 * @param {boolean} formatResponse - The new format_response setting.
 * @returns {Promise<void>}
 */
const updateFormatResponseSetting = async (userId, formatResponse) => {
    try {
        const { error } = await supabase
            .from('users')
            .update({ format_response: formatResponse })
            .eq('user_id', userId);

        if (error) {
            console.error(`❌ Failed to update format_response setting for user ${userId}:`, error);
        } else {
            console.log(`✅ Updated format_response setting for user ${userId} to ${formatResponse}`);
        }
    } catch (error) {
        console.error(`❌ Unexpected error updating format_response setting for user ${userId}:`, error);
    }
};

/**
 * Format a response with a header and footer if the setting is enabled.
 * @param {string} userId - The user's ID.
 * @param {string} message - The message to format.
 * @returns {Promise<string>} - The formatted message.
 */
const formatResponse = async (userId, message) => {
    const formatResponse = await getFormatResponseSetting(userId);
    if (!formatResponse) {
        return message; // Return the message as-is if formatting is disabled
    }

    const header = '🌟 *Header* 🌟\n';
    const footer = '\n🌟 *Footer* 🌟';
    return `${header}${message}${footer}`;
};

module.exports = {
    getFormatResponseSetting,
    updateFormatResponseSetting,
    formatResponse,
};