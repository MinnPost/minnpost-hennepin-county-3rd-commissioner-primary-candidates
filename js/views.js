
/**
 * Views
 *
 * Ractive classes can be extended but we still need a number of
 * things at instantian, like templates
 */
define('views', ['jquery', 'underscore', 'Ractive', 'Ractive-Backbone'],
  function($, _, Ractive, RactiveB) {
  var views = {};

  // Base view to extend from
  views.Base = Ractive.extend({
    baseInit: function(options) {
      this.router = options.router;
    }
  });

  // View for application container
  views.Application = views.Base.extend({
    init: function() {
      this.baseInit.apply(this, arguments);
    }
  });

  // Return what we have
  return views;
});
