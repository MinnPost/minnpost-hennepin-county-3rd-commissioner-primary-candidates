/**
 * Collections
 */
define('collections', ['underscore', 'backbone', 'models'],
  function(_, Backbone, models) {
  var collections = {};

  // Base collection
  collections.Base = Backbone.Collection.extend({
    initialize: function(models, options) {
      // Attach options
      this.options = options || {};
      this.app = options.app;

      // Call this in other collections
      //collection.NEWCollection.__super__.initialize.apply(this, arguments);
    },

    setAll: function(set, options) {
      this.each(function(m, mi) {
        m.set(set, options);
      });
    }

  });

  // Questions
  collections.Questions = collections.Base.extend({
    model: models.Question
  });

  // Candidates
  collections.Candidates = collections.Base.extend({
    model: models.Candidate
  });

  // Categories
  collections.Categories = collections.Base.extend({
    model: models.Category
  });

  // Return what we have
  return collections;
});
