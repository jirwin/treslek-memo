var async = require('async');
var sprintf = require('sprintf');
var moment = require('moment');

var log = require('logmagic').local('treslek.plugins.url');


/*
 * Memo plugin.
 */
var Memo = function() {
  this.commands = ['memo'];
  this.hooks = ['memoHook'];
  this.usage = {
    memo: 'Displays a memo message to users the next time they say something. ex: !memo jirwin Remember to +1 my pr'
  };
};


Memo.prototype.memo = function(bot, to, from, msg, callback) {
  var rc = bot.getRedisClient(),
      nick = '',
      text = '';

  text = msg.split(' ');
  nick = text.shift();
  text = text.join(' ');

  if (!nick) {
    bot.say(to, 'Please enter a nick to leave a memo for');
    rc.quit();
    callback();
    return;
  }

  async.auto({
    'memoId': function(callback) {
      var memoId = sprintf('%s:memos:id', bot.redisConf.prefix);

      rc.incr(memoId, function(err, reply) {
        if (err) {
          log.error('Error retrieving log id', {err: err});
          callback(err);
          return;
        }

        callback(null, reply);
      });
    },

    'storeMemo': ['memoId', function(callback, results) {
      var id = results.memoId,
          memoHashKey = sprintf('%s:memos:%s', bot.redisConf.prefix, id),
          memoObj = {};

      memoObj = {
        time: Date.now().toString(),
        from: from,
        to: to,
        msg: text
      };

      rc.hmset(memoHashKey, memoObj, function(err, reply) {
        if (err) {
          log.error('Error saving memo', {err: err});
          callback(err);
          return;
        }

        callback();
      });
    }],

    'saveMemoId': ['storeMemo', function(callback, results) {
      var id = results.memoId,
          memoStore = sprintf('%s:memoStore:%s', bot.redisConf.prefix, nick);

      rc.rpush(memoStore, id, function(err, reply) {
        if (err) {
          log.error('Error saving memo in store', {err: err});
          callback(err);
          return;
        }

        callback();
      });
    }]
  }, function(err) {
    if (err) {
      log.error('Error creating memo', {err: err});
      bot.say(to, 'Unable to create memo for ' + nick);
      rc.quit();
      callback();
      return;
    }

    bot.say(to, 'Memo for ' + nick + ' saved.');
    callback();
    rc.quit();
  });
};


Memo.prototype.memoHook = function(bot, to, from, msg, callback) {
  var memoStore = sprintf('%s:memoStore:%s', bot.redisConf.prefix, from);
      rc = bot.getRedisClient(),
      foundMemos = true;

  async.doWhilst(
    function(callback) {
      async.auto({
        'getMemoId': function(callback) {
          rc.lpop(memoStore, function(err, reply) {
            if (!reply) {
              foundMemos = false;
              callback();
            }
            callback(null, reply);
          });
        },

        'getMemo': ['getMemoId', function(callback, results) {
          var memo = sprintf('%s:memos:%s', bot.redisConf.prefix, results.getMemoId);

          if (results.getMemoId) {
            rc.hgetall(memo, function(err, memoObj) {
              if (err) {
                log.error('Error getting memo');
                callback();
                return;
              }

              bot.say(from, sprintf('%s said %s: %s', memoObj.from, moment(parseInt(memoObj.time, 10)).from(Date.now()), memoObj.msg));
              callback();
            });
          } else {
            callback();
          }
        }]
      }, callback);
    },

    function() {
      return foundMemos;
    },

    function() {
      rc.quit();
      callback();
    }
  );
};

exports.Plugin = Memo;
