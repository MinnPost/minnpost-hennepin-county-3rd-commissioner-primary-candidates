/**
 * Models
 */
define('models', ['underscore', 'backbone'],
  function(_, Backbone) {
  var models = {};

  // Base model
  models.Base = Backbone.Model.extend({
    initialize: function(data, options) {
      // Attach options
      this.options = options || {};
      this.app = options.app;

      // Call this in other models
      //models.NEWModel.__super__.initialize.apply(this, arguments);
    }

  });

  // Questions
  models.Question = models.Base.extend({
    idAttribute: 'questionid',

    // Something can come unanswerable, if it has not been answered already
    // or the answer is a skip
    makeUnanswerable: function() {
      var state = this.get('state');
      this.set('state', (state !== 'answered' || (state === 'answered' && this.get('answer') === 'S')) ? 'unanswerable' : state);
    }
  });

  // Candidates
  models.Candidate = models.Base.extend({
    idAttribute: 'candidateid'
  });

  // Category
  models.Category = models.Base.extend({
    idAttribute: 'categoryid'
  });

  // Return what we have
  return models;
});
