'use strict';
var Player = require('./ChessPlayer');
var Room = require('./ChessRoom');
var socketAction = require('./action/index');
var ReturnVo = require(process.cwd() + '/game/ReturnVo');
var AV = require('leanengine');

var ChessServer = (function() {
	/**
	 * 工兵扛军旗的服务器
	 * @author chengxg
	 * @since 2017-09-01
	 * @constructor
	 */
	function ChessServer() {
		this.io = null; //socket.io
		this.roomArr = []; //存放所有的房间
		this.playerArr = []; //存放所有的玩家

		this.roomId = 0; //生成的房间编号

		this.isLoginIntercept = true; //是否开启登录拦截
		this.noLoginEventArr = ["login", "register", "findBackPwd"]; //不拦截登录的事件

		this.isDebug = true; //是否是debug模式
	}
	/**
	 * 初始化socke.io
	 * @param {Object} io
	 */
	ChessServer.prototype.initIO = function(io) {
		this.io = io;
		var that = this;
		/**
		 * 有客户端连接时执行
		 * 命名空间:/chess
		 */
		io.of("/chess").on('connection', function(socket) {
			if(that.isLoginIntercept) {
				//登录拦截
				socket.use(function(packet, next) {
					if(socket.player) {
						return next();
					} else {
						if(packet && packet.length > 0 && that.noLoginEventArr.indexOf(packet[0]) > -1) {
							return next();
						} else {
							socket.emit("login");
						}
					}
				});
			}
			socketAction.initSocketEvent(that, socket);

			socket.on('disconnect', function() {
				let player = socket["player"];
				if(player) {
					player.setDisconnTimer(deletePlayerCallback);

					function deletePlayerCallback() {
						that.deletePlayer(player);
					}
				}
			});
			socket.on('disconnecting', (reason) => {

			});
			socket.on('error', (error) => {
				console.log("出现错误：" + error);
			});

			socket.on('playerNum', function(data, fn) {
				if(fn) {
					fn({
						"num": that.playerArr.length
					});
				}
			});
		});
	}

	/**
	 * 通过玩家名称得到该玩家对象
	 * @param {String} playerName
	 * @return {ChessPlayer}
	 */
	ChessServer.prototype.getPlayerByName = function(playerName) {
		let playerArr = this.playerArr;
		let len = playerArr.length;
		let player = null;
		let tempPlayer = null;

		for(let i = 0; i < len; i++) {
			tempPlayer = playerArr[i];
			if(tempPlayer.name == playerName) {
				player = tempPlayer;
				break;
			}
		}
		return player;
	}

	/**
	 * 删除玩家
	 * @param {ChessPlayer} player
	 */
	ChessServer.prototype.deletePlayer = function(player) {
		if(!player) {
			return;
		}
		player.destroy();
		let index = this.playerArr.indexOf(player);
		if(index !== -1) {
			this.playerArr.splice(index, 1);
		}
	}

	/**
	 * 创建玩家
	 * @param {String} palyerName
	 * @return {ChessPlayer} player
	 */
	ChessServer.prototype.createPlayer = function(playerName) {
		return new Player(playerName);
	}

	/**
	 * 删除房间
	 * @param {ChessRoom} room
	 * @return {Boolean} 是否成功删除
	 */
	ChessServer.prototype.deleteRoom = function(room) {
		if(!room) {
			return false;
		}
		return this.deleteRoomById(room.id);
	}

	/**
	 * 通过房间的id删除房间
	 * @param {Number} roomId
	 * @return {Boolean} 是否成功删除
	 */
	ChessServer.prototype.deleteRoomById = function(roomId) {
		let rooms = this.roomArr;
		let len = rooms.length;

		let low = 0,
			mid,
			high = len - 1;
		/**
		 * 二分查找法
		 */
		while(low <= high) {
			mid = Math.floor((low + high) / 2);
			if(rooms[mid].id < roomId) {
				low = mid + 1;
			} else if(rooms[mid].id > roomId) {
				high = mid - 1;
			} else {
				rooms.splice(mid, 1);
				return true;
			}
		}
		return false;
	}

	/**
	 * 通过房间id得到该房间对象
	 * @param {Number} roomId
	 * @return {ChessRoom}
	 */
	ChessServer.prototype.getRoomById = function(roomId) {
		let rooms = this.roomArr;
		let len = rooms.length;
		let room = null;

		let low = 0,
			mid,
			high = len - 1;
		while(low <= high) {
			mid = Math.floor((low + high) / 2);
			if(rooms[mid].id < roomId) {
				low = mid + 1;
			} else if(rooms[mid].id > roomId) {
				high = mid - 1;
			} else {
				room = rooms[mid];
				break;
			}
		}
		return room;
	}

	/**
	 * 通过房间id得到 该房间在房间数组中的索引
	 * @param {String} roomId
	 * @return {Number}
	 */
	ChessServer.prototype.getRoomIndexById = function(roomId) {
		let rooms = this.roomArr;
		let len = rooms.length;
		let index = 0;

		let low = 0,
			mid,
			high = len - 1;
		while(low <= high) {
			mid = Math.floor((low + high) / 2);
			if(rooms[mid].id < roomId) {
				low = mid + 1;
			} else if(rooms[mid].id > roomId) {
				high = mid - 1;
			} else {
				index = mid;
				break;
			}
		}
		return index;
	}

	/**
	 * 服务器分配玩家到房间
	 * @param {ChessPlayer} player
	 */
	ChessServer.prototype.distributeRoom = function(player) {
		let rooms = this.roomArr;
		let len = rooms.length;
		let room = null;
		let lastRoomId = player.lastRoomId;
		let isMatch = false; //是否已经分到房间

		for(let i = 0; i < len; i++) {
			room = rooms[i];
			if(room.id > lastRoomId) {
				isMatch = room.distributePlayer(player);
				if(isMatch) {
					break;
				}
			}
		}
		if(!isMatch) {
			for(let i = 0; i < len; i++) {
				room = rooms[i];
				if(room.id < lastRoomId) {
					isMatch = room.distributePlayer(player);
					if(isMatch) {
						break;
					}
				}
			}
		}

		if(!isMatch) {
			room = this.createRoom();
			room.distributePlayer(player);
		}
	}

	/**
	 * 创建一个房间
	 * @return {ChessRoom}
	 */
	ChessServer.prototype.createRoom = function() {
		this.roomId++;
		let room = new Room(this.roomId, this);
		this.roomArr.push(room);
		return room;
	}

	/**
	 * 玩家离开房间
	 * @param {ChessPlayer} player
	 */
	ChessServer.prototype.leaveRoom = function(player) {
		if(!player) {
			return;
		}
		let room = player.room;
		if(!room) {
			return;
		}
		room.playerLeaveRoom(player);
		this.allPlayerLeaveRoom(room);
	}

	/**
	 * 所有玩家离开房间后,删除房间
	 * @param {ChessRoom} room
	 */
	ChessServer.prototype.allPlayerLeaveRoom = function(room) {
		//都离开后删除该房间
		if(room.player1 == null && room.player2 == null) {
			this.deleteRoom(room);
		}
	}

	return ChessServer;
})();

module.exports = ChessServer;