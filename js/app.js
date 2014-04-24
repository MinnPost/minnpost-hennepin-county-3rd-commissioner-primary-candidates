/**
 * Main application file for: minnpost-hennepin-county-3rd-commissioner-primary-candidates
 *
 * This pulls in all the parts
 * and creates the main object for the application.
 */

// Create main application
define('minnpost-hennepin-county-3rd-commissioner-primary-candidates', [
  'jquery', 'underscore', 'leaflet', 'mpConfig', 'mpFormatters', 'mpMaps',
  'helpers', 'models', 'collections', 'views',
  'text!../data/preferences.json'
], function(
  $, _, L, mpConfig, mpFormatters, mpMaps,
  helpers, models, collections, views,
  tDataPreferences
  ) {

  // Constructor for app
  var App = function(options) {
    this.options = _.extend(this.defaultOptions, options);
    this.el = this.options.el;
    this.$el = $(this.el);
    this.$ = function(selector) { return this.$el.find(selector); };
    this.$content = this.$el.find('.content-container');
    this.loadApp();
  };

  // Extend with custom methods
  _.extend(App.prototype, {
    // Start function
    start: function() {
      var thisApp = this;

      // Load data into models/collections
      this.loadData();

      // Create main view
      this.applicationView = new views.Application({
        el: this.$el,
        data: {
          candidates: this.candidates,
          questions: this.questions,
          categories: this.categories
        },
        app: this
      });

      // Handle events
      this.handleEvents();
    },

    // Event handling for various things that cross multiple objects
    handleEvents: function() {
      var thisApp = this;

      // Answering question
      this.applicationView.on('answer', function(e, params) {
        var answer = params[0];
        var qid = params[1];
        thisApp.questions.get(qid)
          .set('answer', (answer === 'C') ? null : answer)
          .set('state', (answer === 'C') ? 'unanswered' : 'answered');
      });

      // When answers change, rebuild candidate elimination
      this.questions.on('change:answer', function() {
        thisApp.eliminateCandidates();
      });
    },

    // Candidate elimnation.  Go through each question and see
    // if one elimates a candidate.  It only needs to be elimnated once.
    eliminateCandidates: function() {
      var thisApp = this;

      // Reset
      this.candidates.each(function(c, ci) {
        c.set('eliminated', false);
      });

      // Mark
      this.questions.each(function(q, qi) {
        if (q.get('answer') === 'Y') {
          _.each(q.get('eliminatesony'), function(c, ci) {
            thisApp.candidates.get(c).set('eliminated', true);
          });
        }
        if (q.get('answer') === 'N') {
          _.each(q.get('eliminatesonn'), function(c, ci) {
            thisApp.candidates.get(c).set('eliminated', true);
          });
        }
      });
    },

    // Load data.  Note that we will be storing the user data in here
    // as we are not persisting user input anywhere outside.
    loadData: function() {
      var questionsSheet = 'Questions';
      var candidatesSheet = 'Candidates';

      // Process the raw data
      this.rawData = JSON.parse(tDataPreferences);
      // The data is keyed by the title of the sheet and we don't care
      this.rawData = this.rawData[_.keys(this.rawData)[0]];

      // Transform candidates
      this.candidates = new collections.Candidates(
        _.map(this.rawData[candidatesSheet], function(r, ri) {
          r.eliminated = false;
          return r;
        }),
        { app: this }
      );

      // Transform questions
      this.questions = new collections.Questions(
        _.map(this.rawData[questionsSheet], function(r, ri) {
          r.eliminatesonn = _.filter(_.map(r.eliminatesonn.split(','), $.trim), function(i, ii) {
            return !!i;
          });
          r.eliminatesony = _.filter(_.map(r.eliminatesony.split(','), $.trim), function(i, ii) {
            return !!i;
          });
          r.unknownstance = _.filter(_.map(r.unknownstance.split(','), $.trim), function(i, ii) {
            return !!i;
          });
          r.categoryid = mpFormatters.identifier(r.category);
          r.questionid = _.uniqueId('question-');
          r.state = 'unanswered';
          r.answer = null;
          return r;
        }),
        { app: this }
      );

      // Make categories
      this.categories = new collections.Categories(
        this.questions.map(function(q, qi) {
          return q.pick('category', 'categoryid');
        }),
        { app: this }
      );
    },

    // Default options
    defaultOptions: {
      projectName: 'minnpost-hennepin-county-3rd-commissioner-primary-candidates',
      remoteProxy: null,
      el: '.minnpost-hennepin-county-3rd-commissioner-primary-candidates-container',
      availablePaths: {
        local: {

          css: ['.tmp/css/main.css'],
          images: 'images/',
          data: 'data/'
        },
        build: {
          css: [
            '//netdna.bootstrapcdn.com/font-awesome/4.0.3/css/font-awesome.css',
            'dist/minnpost-hennepin-county-3rd-commissioner-primary-candidates.libs.min.css',
            'dist/minnpost-hennepin-county-3rd-commissioner-primary-candidates.latest.min.css'
          ],
          ie: [
            'dist/minnpost-hennepin-county-3rd-commissioner-primary-candidates.libs.min.ie.css',
            'dist/minnpost-hennepin-county-3rd-commissioner-primary-candidates.latest.min.ie.css'
          ],
          images: 'dist/images/',
          data: 'dist/data/'
        },
        deploy: {
          css: [
            '//netdna.bootstrapcdn.com/font-awesome/4.0.3/css/font-awesome.css',
            'https://s3.amazonaws.com/data.minnpost/projects/minnpost-hennepin-county-3rd-commissioner-primary-candidates/minnpost-hennepin-county-3rd-commissioner-primary-candidates.libs.min.css',
            'https://s3.amazonaws.com/data.minnpost/projects/minnpost-hennepin-county-3rd-commissioner-primary-candidates/minnpost-hennepin-county-3rd-commissioner-primary-candidates.latest.min.css'
          ],
          ie: [
            'https://s3.amazonaws.com/data.minnpost/projects/minnpost-hennepin-county-3rd-commissioner-primary-candidates/minnpost-hennepin-county-3rd-commissioner-primary-candidates.libs.min.ie.css',
            'https://s3.amazonaws.com/data.minnpost/projects/minnpost-hennepin-county-3rd-commissioner-primary-candidates/minnpost-hennepin-county-3rd-commissioner-primary-candidates.latest.min.ie.css'
          ],
          images: 'https://s3.amazonaws.com/data.minnpost/projects/minnpost-hennepin-county-3rd-commissioner-primary-candidates/minnpost-hennepin-county-3rd-commissioner-primary-candidates/images/',
          data: 'https://s3.amazonaws.com/data.minnpost/projects/minnpost-hennepin-county-3rd-commissioner-primary-candidates/minnpost-hennepin-county-3rd-commissioner-primary-candidates/data/'
        }
      }
    },

    // Load up app
    loadApp: function() {
      this.determinePaths();
      this.getLocalAssests(function(map) {
        this.renderAssests(map);
        this.start();
      });
    },

    // Determine paths.  A bit hacky.
    determinePaths: function() {
      var query;
      this.options.deployment = 'deploy';

      if (window.location.host.indexOf('localhost') !== -1) {
        this.options.deployment = 'local';

        // Check if a query string forces something
        query = helpers.parseQueryString();
        if (_.isObject(query) && _.isString(query.mpDeployment)) {
          this.options.deployment = query.mpDeployment;
        }
      }

      this.options.paths = this.options.availablePaths[this.options.deployment];
    },

    // Get local assests, if needed
    getLocalAssests: function(callback) {
      var thisApp = this;

      // If local read in the bower map
      if (this.options.deployment === 'local') {
        $.getJSON('bower.json', function(data) {
          callback.apply(thisApp, [data.dependencyMap]);
        });
      }
      else {
        callback.apply(this, []);
      }
    },

    // Rendering tasks
    renderAssests: function(map) {
      var isIE = (helpers.isMSIE() && helpers.isMSIE() <= 8);

      // Add CSS from bower map
      if (_.isObject(map)) {
        _.each(map, function(c, ci) {
          if (c.css) {
            _.each(c.css, function(s, si) {
              s = (s.match(/^(http|\/\/)/)) ? s : 'bower_components/' + s + '.css';
              $('head').append('<link rel="stylesheet" href="' + s + '" type="text/css" />');
            });
          }
          if (c.ie && isIE) {
            _.each(c.ie, function(s, si) {
              s = (s.match(/^(http|\/\/)/)) ? s : 'bower_components/' + s + '.css';
              $('head').append('<link rel="stylesheet" href="' + s + '" type="text/css" />');
            });
          }
        });
      }

      // Get main CSS
      _.each(this.options.paths.css, function(c, ci) {
        $('head').append('<link rel="stylesheet" href="' + c + '" type="text/css" />');
      });
      if (isIE) {
        _.each(this.options.paths.ie, function(c, ci) {
          $('head').append('<link rel="stylesheet" href="' + c + '" type="text/css" />');
        });
      }

      // Add a processed class
      this.$el.addClass('inline-processed');
    }
  });

  return App;
});


/**
 * Run application
 */
require(['jquery', 'minnpost-hennepin-county-3rd-commissioner-primary-candidates'], function($, App) {
  $(document).ready(function() {
    var app = new App();
  });
});
