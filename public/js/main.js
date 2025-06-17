
document.addEventListener('DOMContentLoaded', () => {

    const app = {
        // --- Sockets & WebRTC ---
        socket: io(),
        peerConnection: null,
        dataChannel: null,
        iceServers: [],
        roomId: null,
        isInitiator: false,

        // --- UI Elements ---
        ui: {
            senderView: document.getElementById('sender-view'),
            shareLinkView: document.getElementById('share-link-view'),
            receiverView: document.getElementById('receiver-view'),
            status: document.getElementById('status'),
            downloadLink: document.getElementById('download-link'),
            fileInput: document.getElementById('file-input'),
            fileDropzone: document.getElementById('file-dropzone'),
            shareLinkInput: document.getElementById('share-link-input'),
            copyButton: document.getElementById('copy-button'),
            progressBarContainer: document.getElementById('progress-bar-container'),
            progressBar: document.getElementById('progress-bar'),
        },

        // --- Initialization ---
        init() {
            this.setupSocketListeners();
            this.determineRole();
        },

        setupSocketListeners() {
            this.socket.on('config', (iceServers) => {
                this.iceServers = iceServers;
            });
            this.socket.on('created', (roomId) => this.onRoomCreated(roomId));
            this.socket.on('joined', () => this.log('Peer has joined. Establishing connection...'));
            this.socket.on('full', (roomId) => this.log(`Error: Room ${roomId} is full.`));
            this.socket.on('ready', () => this.onReadyToConnect());
            this.socket.on('message', (message) => this.onMessageReceived(message));
            this.socket.on('peer-disconnected', () => this.onPeerDisconnected());
        },

        determineRole() {
            const path = window.location.pathname;
            if (path.startsWith('/room/')) {
                this.roomId = path.split('/')[2];
                this.isInitiator = false;
                this.ui.senderView.style.display = 'none';
                this.ui.receiverView.style.display = 'block';
                this.log('Connecting to room...');
                this.socket.emit('create or join', this.roomId);
            } else {
                this.isInitiator = true;
                this.ui.status.textContent = '';
                this.setupSenderEventListeners();
            }
        },

        setupSenderEventListeners() {
            const { ui } = this;
            ui.fileDropzone.onclick = () => ui.fileInput.click();
            ui.fileDropzone.ondragover = e => { e.preventDefault(); ui.fileDropzone.classList.add('dragover'); };
            ui.fileDropzone.ondragleave = () => ui.fileDropzone.classList.remove('dragover');
            ui.fileDropzone.ondrop = e => {
                e.preventDefault();
                ui.fileDropzone.classList.remove('dragover');
                const droppedFile = e.dataTransfer.files[0];
                if (droppedFile) this.handleFileSelection(droppedFile);
            };
            ui.fileInput.onchange = () => {
                const selectedFile = ui.fileInput.files[0];
                if (selectedFile) this.handleFileSelection(selectedFile);
            };
            ui.copyButton.onclick = () => this.copyShareLink();
        },
        
        // --- THIS IS THE CORRECTED COPY FUNCTION ---
        copyShareLink() {
            const { ui } = this;
            const textToCopy = ui.shareLinkInput.value;

            // Try the modern, secure Clipboard API first
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(textToCopy).then(() => {
                    ui.copyButton.textContent = 'Copied!';
                    setTimeout(() => { ui.copyButton.textContent = 'Copy'; }, 2000);
                }).catch(err => {
                    console.error('Modern copy failed. Falling back.', err);
                    this.copyShareLinkFallback(); // Fallback on error
                });
            } else {
                // Fallback for insecure contexts (like http) or older browsers
                console.warn('Using fallback copy method.');
                this.copyShareLinkFallback();
            }
        },

        copyShareLinkFallback() {
            const { ui } = this;
            ui.shareLinkInput.select();
            ui.shareLinkInput.setSelectionRange(0, 99999); // For mobile devices

            try {
                document.execCommand('copy');
                ui.copyButton.textContent = 'Copied!';
            } catch (err) {
                console.error('Fallback copy command failed', err);
                ui.copyButton.textContent = 'Error!';
            }
            setTimeout(() => { ui.copyButton.textContent = 'Copy'; }, 2000);
        },
        // --- END OF CORRECTED COPY FUNCTION ---

        handleFileSelection(selectedFile) {
            this.file = selectedFile;
            this.roomId = Math.random().toString(36).substring(2, 9);
            this.socket.emit('create or join', this.roomId);
        },

        onRoomCreated(roomId) {
            this.ui.senderView.style.display = 'none';
            this.ui.shareLinkView.style.display = 'block';
            const shareLink = `${window.location.origin}/room/${roomId}`;
            this.ui.shareLinkInput.value = shareLink;
            this.log('Share this link to send the file.');
        },

        onReadyToConnect() {
            this.createPeerConnection();
            if (this.isInitiator) {
                this.log('Creating offer...');
                this.peerConnection.createOffer()
                    .then(offer => this.peerConnection.setLocalDescription(offer))
                    .then(() => this.sendMessage(this.peerConnection.localDescription));
            }
        },

        onMessageReceived(message) {
            if (message.type === 'offer') {
                if (!this.isInitiator) this.createPeerConnection();
                this.peerConnection.setRemoteDescription(new RTCSessionDescription(message))
                    .then(() => this.peerConnection.createAnswer())
                    .then(answer => this.peerConnection.setLocalDescription(answer))
                    .then(() => this.sendMessage(this.peerConnection.localDescription));
            } else if (message.type === 'answer') {
                this.peerConnection.setRemoteDescription(new RTCSessionDescription(message));
            } else if (message.type === 'candidate') {
                this.peerConnection.addIceCandidate(new RTCIceCandidate({ sdpMLineIndex: message.label, candidate: message.candidate }));
            }
        },

        onPeerDisconnected() {
            this.log('The other user has disconnected.');
            this.resetConnection();
            this.ui.shareLinkView.style.display = 'none';
            this.ui.receiverView.style.display = 'none';
        },

        createPeerConnection() {
            this.log('Establishing peer connection...');
            this.peerConnection = new RTCPeerConnection({ iceServers: this.iceServers });
            this.peerConnection.onicecandidate = e => {
                if (e.candidate) this.sendMessage({ type: 'candidate', label: e.candidate.sdpMLineIndex, id: e.candidate.sdpMid, candidate: e.candidate.candidate });
            };
            this.peerConnection.onconnectionstatechange = () => this.handleConnectionStateChange();

            if (this.isInitiator) {
                this.dataChannel = this.peerConnection.createDataChannel('fileTransfer');
                this.dataChannel.onopen = () => this.onDataChannelStateChange();
                this.dataChannel.onclose = () => this.onDataChannelStateChange();
            } else {
                this.peerConnection.ondatachannel = e => {
                    this.dataChannel = e.channel;
                    this.setupReceiverDataChannel();
                };
            }
        },

        handleConnectionStateChange() {
            const state = this.peerConnection.connectionState;
            this.log(`Connection state: ${state}`);
            if (state === 'failed') {
                this.log('Connection failed. Please check your network or try again.');
                this.resetConnection();
            }
        },
        
        onDataChannelStateChange() {
            if (this.dataChannel.readyState === 'open') {
                this.log('Connection established! Sending file...');
                this.sendFile();
            }
        },

        setupReceiverDataChannel() {
            let receivedBuffers = [];
            let receivedSize = 0;
            let fileMetadata;
            this.dataChannel.onmessage = e => {
                if (typeof e.data === 'string') {
                    const { type, payload } = JSON.parse(e.data);
                    if (type === 'metadata') {
                        fileMetadata = payload;
                        this.log(`Incoming file: ${fileMetadata.name}`);
                        return;
                    }
                }
                receivedBuffers.push(e.data);
                receivedSize += e.data.byteLength;
                this.updateProgressBar((receivedSize / fileMetadata.size) * 100);
                if (receivedSize === fileMetadata.size) {
                    this.log('File received successfully!');
                    const receivedFile = new Blob(receivedBuffers, { type: fileMetadata.type });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(receivedFile);
                    a.download = fileMetadata.name;
                    a.innerHTML = `✔ Download ${fileMetadata.name}`;
                    this.ui.downloadLink.innerHTML = '';
                    this.ui.downloadLink.appendChild(a);
                }
            };
        },

        sendFile() {
            this.dataChannel.send(JSON.stringify({ type: 'metadata', payload: { name: this.file.name, size: this.file.size, type: this.file.type } }));
            const chunkSize = 16384;
            let offset = 0;
            const reader = new FileReader();
            reader.onload = () => {
                this.dataChannel.send(reader.result);
                offset += reader.result.byteLength;
                this.updateProgressBar((offset / this.file.size) * 100);
                if (offset < this.file.size) {
                    readSlice(offset);
                } else {
                    this.log('File sent!');
                }
            };
            const readSlice = o => reader.readAsArrayBuffer(this.file.slice(o, o + chunkSize));
            readSlice(0);
        },

        sendMessage(message) {
            this.socket.emit('message', message, this.roomId);
        },

        log(message) {
            this.ui.status.textContent = message;
            console.log(message);
        },

        updateProgressBar(value) {
            this.ui.progressBarContainer.style.display = 'block';
            this.ui.progressBar.style.width = `${value}%`;
        },

        resetConnection() {
            if (this.dataChannel) this.dataChannel.close();
            if (this.peerConnection) this.peerConnection.close();
            this.dataChannel = null;
            this.peerConnection = null;
            this.ui.progressBarContainer.style.display = 'none';
            this.updateProgressBar(0);
        },
    };

    app.init();

    app.init();
});