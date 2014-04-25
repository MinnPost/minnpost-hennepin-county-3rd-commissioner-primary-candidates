
/**
 * Views
 *
 * Ractive classes can be extended but we still need a number of
 * things at instantian, like templates
 */
define('views', ['jquery', 'underscore', 'ractive', 'ractive-backbone', 'ractive-events-tap',
  'text!templates/application.mustache',
  'text!templates/loading.mustache'
],
  function($, _, Ractive, RactiveB, RactiveEventTap, tApplication, tLoading) {
  var views = {};

  // Base view to extend from
  views.Base = Ractive.extend({
    baseInit: function(options) {
      this.app = options.app;
    },
    adapt: [ 'Backbone' ]
  });

  // View for application container
  views.Application = views.Base.extend({
    template: tApplication,
    partials: {
      loading: tLoading
    },
    init: function() {
      var thisView = this;
      this.baseInit.apply(this, arguments);

      // This is the best place to stick the top nav.  Only make it happen
      // once the candidates are loaded
      this.observe('candidates', function(n, o) {
        if (!_.isUndefined(n) && !thisView.stuck) {
          _.delay(function() {
            $(thisView.el).find('.top-container').mpStick({});
          }, 500);
          thisView.stuck = true;
        }
      });
    }
  });

  // Return what we have
  return views;
});
