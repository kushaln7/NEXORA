const app = require('../nexora-main/server.js');

module.exports = (req, res) => {
  return app(req, res);
};
