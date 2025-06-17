
const config = {
    // Server port
    port: process.env.PORT || 8080,

    // WebRTC ICE (Interactive Connectivity Establishment) server configuration.
    // These servers are used to establish a peer-to-peer connection.
    iceServers: [
        // STUN servers - used for NAT traversal.
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },

        // --- PRODUCTION: IMPORTANT ---
        // For a production app to work reliably across all networks, you MUST
        // use a TURN server. STUN is not enough. The following is a free,
        // public TURN server for development/testing purposes ONLY.
        // For production, replace this with your own TURN server solution.
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject',
        },
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject',
        },
    ],
};

module.exports = config;