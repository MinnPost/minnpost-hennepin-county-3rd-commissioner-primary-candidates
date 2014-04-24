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
    idAttribute: 'questionid'
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
