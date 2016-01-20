"use strict";

/*
data.item = {
	time
	data: {
		msg
		user
		...etc
	}
	id
}
*/

var Peer = require('peerjs'),
	Events = require('events');

var mergeArray = function(arr1, arr2) {
	return arr1.concat(arr2)
				.reduce(function(p, c) {
					if (p.indexOf(c) === -1) {
						p.push(c);
					}
					return p;
				}, []);
};

var mergeChat = function(arr1, arr2, maxLength) {
	var arrF = arr1.concat(arr2)
					.reduce(function (p, c) {
						var exists = p.filter(function(item) {
							return item.id === c.id;
						});
						if (exists.length === 0) {
							p.push(c);
						}
						return p;
					}, [])
					.sort(function(a, b) {
						return b.time - a.time;
					});
	if (maxLength) {
		arrF.length = Math.min(maxLength, arrF.length);
	}
	return arrF;
};

var Broadcaster = function(opts) {
	Events.EventEmitter.call(this);
	//
	var that = this;
	this.peers = [];
	this.data = [];
	this.network = opts.network;
	//
	var peer = new Peer(opts.network, { key: opts.apiKey, config: { iceServers: [ { url: 'stun:stun.l.google.com:19302' } ]} });
	peer.on('open', function(id) {
		//console.log('Broadcaster created');
		peer.on('connection', that._newConnection.bind(that));
	});
};
Broadcaster.prototype._newConnection = function(conn) {
	//console.log('Broadcaster new connection: ', conn.peer)
	var that = this;
	if (this.peers.indexOf(conn) === -1) {
		this.peers.push(conn);
	}
	conn.on('data', function(obj) {
		//console.log('Broadcaster conn.on.data: ', obj);
		var newData = {
			time: Date.now(),
			data: obj,
			id: Date.now() + '-' + that.network + '-' + conn.peer
		};
		that.data = mergeChat(that.data, [newData], that.maxItems);
		that._notifyNetwork({
			msg: 'update',
			data: that.data
		});
	});
	conn.on('close', function() {
		that.peers.splice(that.peers.indexOf(conn), 1);
	});
};
Broadcaster.prototype._notifyNetwork = function(data) {
	//console.log('Broadcaster notify ', this.peers, data);
	this.peers.forEach(function(conn) {
		conn.send(data);
	});
};

var Chat = function(opts) {
	if (opts && opts.apiKey) {
		Events.EventEmitter.call(this);
		//
		this.network = opts.network || 'webrtc-chat-' + Math.random();
		this.apiKey = opts.apiKey;
		this.maxItems = opts.maxItems || 5;
		this.data = [];
		this.broadcasterConnection = null;
		this.broadcaster = new Broadcaster({
			network: this.network,
			apiKey: this.apiKey
		});
		this.peer = new Peer({ key: this.apiKey, config: { iceServers: [ { url: 'stun:stun.l.google.com:19302' } ]} });
	} else {
		console.warn('WebRTC Chat JS: error: constructor: please provide a peerjs api key');
		return null;
	}
};
Chat.prototype = Object.create(Events.EventEmitter.prototype);

Chat.prototype.connect = function() {
	var that = this;
	return new Promise(function(resolve, reject) {
		var conn = that.peer.connect(that.network);
		that.peer.on('error', reject);
		that.peer.on('open', function() {
			console.log('Chat joined network; Chat id: ', that.peer.id);
			that._newConnection(conn);
			resolve();
		});
	});
};
Chat.prototype._newConnection = function(conn) {
	//console.log('Chat new connection: ', conn)
	var that = this;
	this.broadcasterConnection = conn;
	conn.on('data', function(obj) {
		//console.log('Chat conn.on.data: ', obj);
		switch (obj.msg) {
			case 'update':
				that.data = mergeChat(that.data, obj.data, that.maxItems);
				that.emit('update', that.data);
				break;
		}
	});
	conn.on('close', function() {
		//console.log('We\'ve lost the broadcaster');
		that.broadcasterConnection = null;
		that.broadcaster = new Broadcaster({
			network: that.network,
			apiKey: that.apiKey
		});
		var old_id = that.peer.id;
		that.peer.destroy();
		setTimeout(function() {
			that.peer = new Peer(old_id, { key: that.apiKey, config: { iceServers: [ { url: 'stun:stun.l.google.com:19302' } ]} });
			that.connect();
		}, 1000);
	});
};
Chat.prototype.send = function(data) {
	if (this.broadcasterConnection) {
		this.broadcasterConnection.send(data);
	}
};


module.exports = Chat;
