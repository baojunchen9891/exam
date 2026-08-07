/* Web 账号系统：封装 register / login 云函数调用（与小程序共享 users 集合，手机号为主键）
 * 依赖 assets/js/cloudbase.js（window.cloudbase）。
 */
(function (global) {
  'use strict';
  var ENV = 'kaoji-d2g92wlv34453fe55';
  var app = null;
  var KEY = 'exam_web_user';

  function getApp() {
    if (app) return app;
    if (!global.cloudbase) throw new Error('cloudbase SDK 未加载');
    app = global.cloudbase.init({ env: ENV });
    return app;
  }

  function call(name, data) {
    return getApp().callFunction({ name: name, data: data || {} }).then(function (r) {
      var res = r && r.result;
      if (res && res.ok) return res.data;
      throw new Error((res && res.msg) || '服务异常');
    });
  }

  var API = {
    register: function (p) { return call('register', p); },
    loginWeb: function (identifier, password) {
      return call('login', { channel: 'web', identifier: identifier, password: password });
    },
    getSession: function () {
      try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
    },
    setSession: function (u) { localStorage.setItem(KEY, JSON.stringify(u)); },
    clear: function () { localStorage.removeItem(KEY); },
    logout: function () { this.clear(); }
  };

  global.ExamAccount = API;
})(window);
