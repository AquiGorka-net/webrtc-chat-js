"use strict";

var Peer = require('peerjs'),
	Events = require('events');

var mergeArray = function(arr1, arr2, maxLength) {
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
	//
	var peer = new Peer(opts.network, { key: opts.apiKey });
	peer.on('error', function(err) {
		if (err.type === 'unavailable-id') {
			console.log('Broadcaster exists');
		}
	});
	peer.on('open', function(id) {
		console.log('Broadcaster created');
		peer.on('connection', that._newConnection.bind(that));
	});
	
};
Broadcaster.prototype._newConnection = function(conn) {
	console.log('Broadcaster new connection: ', conn)
	var that = this;
	if (this.peers.indexOf(conn) < 0) {
		this.peers.push(conn);
		this._notifyNetwork({
			msg: 'connection',
			data: {
				connections: this.peers.map(function(conn) {
					return conn.peer;
				})
			}
		});
	}
	conn.on('data', function(obj) {
		console.log('Broadcaster conn.on.data: ', obj);
		switch (obj.msg) {
			case 'update':
				that.data = mergeArray(that.data, obj.data, that.maxItems);
				that._notifyNetwork({
					msg: 'update',
					data: that.data
				});
				break;
		}
	});
	conn.on('close', function() {
		that.peers.splice(that.peers.indexOf(conn), 1);
	});
};
Broadcaster.prototype._notifyNetwork = function(data) {
	this.peers.forEach(function(conn) {
		conn.send(data);
	});
};

var Chat = function(opts) {
	this.opts = opts;
	if (opts && opts.apiKey) {
		Events.EventEmitter.call(this);
		//
		this.network = opts.network || 'webrtc-chat';
		this.peers = [];
		this.peersIds = [];
		this.data = [];
		this.maxItems = opts.maxItems || 5;
		this.broadcaster = new Broadcaster({
			network: this.network,
			apiKey: opts.apiKey
		});
		this.peer = new Peer({ key: opts.apiKey });
		this.peer.on('connection', this._newConnection.bind(this));
	} else {
		console.warn('WebRTC Chat JS: error: constructor: please provide a peerjs api key');
		return null;
	}
};
Chat.prototype = Object.create(Events.EventEmitter.prototype);

Chat.prototype.connect = function() {
	return this._connectToPeer(this.network);
};
Chat.prototype._connectToPeer = function(id) {
	var that = this;
	return new Promise(function(resolve, reject) {
		var conn = that.peer.connect(id);
		that.peer.on('error', reject);
		that.peer.on('open', function() {
			console.log('Network joined; My id: ', that.peer.id);
			that._newConnection(conn);
			resolve();
		});
	});
};
Chat.prototype._newConnection = function(conn) {
	console.log('Peer new connection: ', conn)
	var that = this;
	if (this.peers.indexOf(conn) < 0) {
		this.peers.push(conn);
	}
	conn.on('data', function(obj) {
		console.log('Chat conn.on.data: ', obj);
		switch (obj.msg) {
			case 'connection':
				// maybe a mix?
				that.peersIds = mergeArray(that.peersIds, obj.data.connections);
				break;
			case 'update':
				that.data = mergeArray(that.data, obj.data, that.maxItems);
				that.emit('update');
				break;
		}
	});
	// this is actually the broadcaster
	conn.on('close', function() {
		that.peers.splice(that.peers.indexOf(conn), 1);
	});
};
Chat.prototype._notifyConnections = function(data) {
	this.peers.forEach(function(conn) {
		conn.send(data);
	});
};
Chat.prototype.send = function(data) {
	this.data = mergeArray(this.data, [{
		time: Date.now(),
		data: data,
		id: Date.now() + '-' + this.network + '-' + this.peer.id
	}], this.maxItems);
	this._notifyConnections({
		msg: 'update',
		data: this.data
	});
	this.emit('update');
};


module.exports = Chat;

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
/*
var mergeArray = function(arr1, arr2, maxLength) {
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
	arrF.length = Math.min(maxLength, arrF.length);
	return arrF;
};

var Chat = function(opts) {
	this.peers = [];
	this.data = [];
	this.maxItems = 5;
	this.id = Math.floor(Math.random() * 10000000);
	this.network = Math.floor(Math.random() * 10000000);
	//
	if (opts && opts.maxItems) {
		this.maxItems = opts.maxItems;
	}
	//
	Events.EventEmitter.call(this);
};
Chat.prototype = Object.create(Events.EventEmitter.prototype);

Chat.prototype.connect = function(opts) {
	var that = this;
	if (opts && opts.apiKey) {
		if (opts && opts.id) {
			this.network = opts.id;
			return new Promise(function(resolve, reject) {
				that._startNetwork(opts)
					.then(function() {
						resolve(opts.id);
					})
					.catch(function(err) {
						// peer network exists with such id
						//console.log(err.type)
						if (err.type === 'unavailable-id') {
							that._connectToPeer(opts).then(function () {
								resolve(opts.id);
							});
						} else {
							reject(err);
						}
					});
			});
		} else {
			return Promise.reject('WebRTC Chat JS: Error: connect: please provide an id (unique identifier for the chat network)');
		}
	} else {
		return Promise.reject('WebRTC Chat JS: Error: connect: please provide a peerjs api key');
	}
};
Chat.prototype._connectToPeer = function(opts) {
	var that = this;
	return new Promise(function(resolve, reject) {
		var peer = new Peer({ key: opts.apiKey });
		var conn = peer.connect(opts.id);
		peer.on('open', function() {
			console.log('Network joined; My id: ', peer.id);
			that.id = peer.id;
			that._newConnection(conn);
			resolve();
		});
		peer.on('connection', that._newConnection.bind(that));
	});
};
Chat.prototype._newConnection = function(conn) {
	console.log('new connection: ', conn)
	var that = this;
	if (this.peers.indexOf(conn) < 0) {
		this.peers.push(conn);
		this._notifyConnections({
			msg: 'connection',
			data: {
				connections: this.peers.map(function(conn) {
					return conn.peer;
				})
			}
		});
	}
	conn.on('data', function(obj) {
		switch (obj.msg) {
			case 'close':
				// look for a better way to interpret this
				//this.peers = obj.data.connections;
				break;
			case 'connection':
				// maybe a mix?
				//this.peers = obj.data.connections
				console.log('what should I do? : ', obj)

				break;
			case 'update':
				that.data = mergeArray(that.data, obj.data, that.maxItems);
				that.emit('update');
				break;
		}
	});
	//
	//conn.on('close', function() {
	//	that.peers.splice(that.peers.indexOf(conn), 1);
	//	that._notifyConnections({
	//		msg: 'close',
	//		connections: that.peers
	//	});
	//});
	//
};
Chat.prototype._notifyConnections = function(data) {
	this.peers.forEach(function(conn) {
		conn.send(data);
	});
};
Chat.prototype._startNetwork = function(opts) {
	var that = this;
	return new Promise(function(resolve, reject) {
		var peer = new Peer(opts.id, { key: opts.apiKey });
		peer.on('error', reject);
		peer.on('open', function(id) {
			console.log('Network started; My id: ', peer.id, ' or ', id);
			that.id = peer.id;
			resolve();
		});
		peer.on('connection', that._newConnection.bind(that));
	});
};
Chat.prototype.send = function(data) {
	this.data = mergeArray(this.data, [{
		time: Date.now(),
		data: data,
		id: Date.now() + '-' + this.network + '-' + this.id
	}], this.maxItems);
	this._notifyConnections({
		msg: 'update',
		data: this.data
	});
	this.emit('update');
};

module.exports = Chat;
*/