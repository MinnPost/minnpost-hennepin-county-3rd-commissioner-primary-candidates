
/**
 * Helpers functions such as formatters or extensions
 * to libraries.
 */
define('helpers', ['jquery', 'underscore', 'backbone'],
  function($, _, Backbone) {

  var helpers = {};


  /**
   * Override Backbone's ajax call to use JSONP by default as well
   * as force a specific callback to ensure that server side
   * caching is effective.
   */
  Backbone.ajax = function() {
    var options = arguments;

    if (options[0].dataTypeForce !== true) {
      options[0].dataType = 'jsonp';
      options[0].jsonpCallback = 'mpServerSideCachingHelper' +
        _.hash(options[0].url);
    }
    return Backbone.$.ajax.apply(Backbone.$, options);
  };


  /**
   * Returns version of MSIE.
   */
  helpers.isMSIE = function() {
    var match = /(msie) ([\w.]+)/i.exec(navigator.userAgent);
    return match ? parseInt(match[2], 10) : false;
  };

  /**
   * Wrapper for a JSONP request, the first set of options are for
   * the AJAX request, while the other are from the application.
   */
  helpers.jsonpRequest = function(requestOptions, appOptions) {
    options.dataType = 'jsonp';
    options.jsonpCallback = 'mpServerSideCachingHelper' +
      _.hash(options.url);

    if (appOptions.remoteProxy) {
      options.url = options.url + '&callback=mpServerSideCachingHelper';
      options.url = appOptions.remoteProxy + encodeURIComponent(options.url);
      options.cache = true;
    }

    return $.ajax.apply($, [options]);
  };

  /**
   * Data source handling.  For development, we can call
   * the data directly from the JSON file, but for production
   * we want to proxy for JSONP.
   *
   * `name` should be relative path to dataset
   * `options` are app options
   *
   * Returns jQuery's defferred object.
   */
  helpers.getLocalData = function(name, options) {
    var useJSONP = false;
    var defers = [];
    name = (_.isArray(name)) ? name : [ name ];

    // If the data path is not relative, then use JSONP
    if (options && options.paths && options.paths.data.indexOf('http') === 0) {
      useJSONP = true;
    }

    // Go through each file and add to defers
    _.each(name, function(d) {
      var defer;

      if (useJSONP) {
        defer = helpers.jsonpRequest({
          url: proxyPrefix + encodeURI(options.paths.data + d)
        }, options);
      }
      else {
        defer = $.getJSON(options.paths.data + d);
      }
      defers.push(defer);
    });

    return $.when.apply($, defers);
  };

  /**
   * Reads query string and turns into object.
   */
  helpers.parseQueryString = function() {
    var assoc  = {};
    var decode = function(s) {
      return decodeURIComponent(s.replace(/\+/g, " "));
    };
    var queryString = location.search.substring(1);
    var keyValues = queryString.split('&');

    _.each(keyValues, function(v, vi) {
      var key = v.split('=');
      if (key.length > 1) {
        assoc[decode(key[0])] = decode(key[1]);
      }
    });

    return assoc;
  };

  return helpers;
});

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


define('text!templates/application.mustache',[],function () { return '<div class="application-container">\n  <div class="message-container"></div>\n\n  <div class="content-container">\n\n    <div class="candidate-list">\n      <div class="row">\n        {{#candidates}}\n          <div class="candidate column-medium-15 {{#eliminated}}eliminated{{/eliminated}}">\n            {{ name }}\n          </div>\n        {{/candidates}}\n      </div>\n\n      <div class="options">\n        <button on-tap="clearQuestions" class="button xsmall danger">Clear all</button>\n      </div>\n    </div>\n\n\n    <div class="category-list">\n      {{#categories}}\n        <button class="button xsmall category">\n          {{ category }}\n        </button>\n      {{/categories}}\n    </div>\n\n\n    <div class="question-list">\n      {{#questions}}\n        <div class="question {{ state }}">\n          <div class="question-text">{{ question }}</div>\n          <div class="question-options">\n            <button on-tap="answer:[\'Y\', {{ questionid }}]" class="button small primary {{#(answer === \'Y\')}}active{{/()}}">Yes</button>\n            <button on-tap="answer:[\'N\', {{ questionid }}]" class="button small primary {{#(answer === \'N\')}}active{{/()}}">No</button>\n            <button on-tap="answer:[\'C\', {{ questionid }}]" class="button small info">Clear</button>\n          </div>\n        </div>\n      {{/questions}}\n    </div>\n\n\n\n  </div>\n\n  <div class="footnote-container">\n    <div class="footnote">\n      <p>Some code, techniques, and data on <a href="https://github.com/minnpost/minnpost-hennepin-county-3rd-commissioner-primary-candidates" target="_blank">Github</a>.</p>\n\n        <p>Some map data © OpenStreetMap contributors; licensed under the <a href="http://www.openstreetmap.org/copyright" target="_blank">Open Data Commons Open Database License</a>.  Some map design © MapBox; licensed according to the <a href="http://mapbox.com/tos/" target="_blank">MapBox Terms of Service</a>.  Location geocoding provided by <a href="http://www.mapquest.com/" target="_blank">Mapquest</a> and is not guaranteed to be accurate.</p>\n\n    </div>\n  </div>\n</div>\n';});


define('text!templates/loading.mustache',[],function () { return '<div class="loading-container">\n  <div class="loading"><span>Loading...</span></div>\n</div>';});


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
      this.baseInit.apply(this, arguments);
    }
  });

  // Return what we have
  return views;
});


define('text!../data/preferences.json',[],function () { return '{"Candidate guide to Hennepin County 3rd Commissioner Primary":{"Questions":[{"category":"Partisanship","question":"Do you want a candidate who sought DFL endorsement?","eliminatesony":"carney, reuer","eliminatesonn":"greene, mavity, kelash, schweigert","unknownstance":"","na":"","rowNumber":1},{"category":"Union support","question":"Do you want a candidate with union support?","eliminatesony":"greene, carney, reuer","eliminatesonn":"mavity, kelash, schweigert","unknownstance":"","na":"","rowNumber":2},{"category":"Union support","question":"Do you want a candidate supported by AFSCME, Teamsters, and Hennepin County Sheriff’s Deputies?","eliminatesony":"mavity, greene, carney, reuer, kelash","eliminatesonn":"schweigert","unknownstance":"","na":"","rowNumber":3},{"category":"Union support","question":"Do you want a candidate supported by the Carpenters, Building Trades, Laborerers, Locomotive workers?","eliminatesony":"mavity, greene, carney, reuer, schweigert","eliminatesonn":"kelash","unknownstance":"","na":"","rowNumber":4},{"category":"Residence","question":"Do you want a candidate who lives in Minneapolis?","eliminatesony":"mavity","eliminatesonn":"greene, carney, reuer, kelash, schweigert","unknownstance":"","na":"","rowNumber":5},{"category":"Residence","question":"Do you want a candidate who lives in St. Louis Park?","eliminatesony":"greene, carney, reuer, kelash, schweigert","eliminatesonn":"mavity","unknownstance":"","na":"","rowNumber":6},{"category":"Elected experience","question":"Do you want a candidate with previous elected experience?","eliminatesony":"carney, reuer, schweigert","eliminatesonn":"greene, kelash, mavity","unknownstance":"","na":"","rowNumber":7},{"category":"Minneapolis mayoral election","question":"Do you want a candidate who endorsed Mark Andrew for 2013 Minneapolis mayor?","eliminatesony":"carney, reuer, schweigert, mavity","eliminatesonn":"greene, kelash","unknownstance":"","na":"","rowNumber":8},{"category":"Southwest LRT","question":"Do you want a candidate who would replace Southwest LRT with busways?","eliminatesony":"greene, mavity, kelash, schweigert, reuer","eliminatesonn":"carney","unknownstance":"","na":"","rowNumber":9},{"category":"Endorsements","question":"Do you want a candidate endorsed by Progressive Majority and the St. Louis Park City Council?","eliminatesony":"greene, carney, reuer, kelash, schweigert","eliminatesonn":"mavity","unknownstance":"","na":"","rowNumber":10},{"category":"Endorsements","question":"Do you want a candidate endorsed by Stonewall DFL, Dee Long, Margaret Kelliher and Hennepin Commissioner Linda Higgins?","eliminatesony":"mavity, carney, reuer, kelash, schweigert","eliminatesonn":"greene","unknownstance":"","na":"","rowNumber":11},{"category":"Endorsements","question":"Do you want a candidate endorsed by Rep. Joe Mullery and former NRP director Bob Miller? ","eliminatesony":"mavity, carney, reuer, schweigert, greene","eliminatesonn":"kelash","unknownstance":"","na":"","rowNumber":12},{"category":"Endorsements","question":"Do you want a candidate endorsed by Minneapolis School Board members Mammen, Monserrate and Gagnon?","eliminatesony":"mavity, carney, reuer, kelash, schweigert","eliminatesonn":"greene","unknownstance":"","na":"","rowNumber":13},{"category":"Endorsements","question":"Do you want a candidate endorsed by County Attoney Mike Freeman and Reps. Karen Clark & Susan Allen?","eliminatesony":"mavity, greene, carney, reuer, kelash","eliminatesonn":"schweigert","unknownstance":"","na":"","rowNumber":14},{"category":"Endorsements","question":"Do you want a candidate endorsed by the GOP?","eliminatesony":"greene, mavity, kelash, schweigert, reuer","eliminatesonn":"carney","unknownstance":"","na":"","rowNumber":15}],"Candidates":[{"candidateid":"carney","name":"Bob “Again” Carney Jr.","profileurl":"http://www.minnpost.com/community-voices/2014/04/hennepin-commissioner-candidate-demand-southwest-lrt-alternatives","rowNumber":1},{"candidateid":"reuer","name":"Bob Reuer","profileurl":"","rowNumber":2},{"candidateid":"greene","name":"Marion Greene","profileurl":"http://www.minnpost.com/politics-policy/2014/04/hennepin-county-commissioner-election-interview-marion-greene","rowNumber":3},{"candidateid":"mavity","name":"Anne Mavity","profileurl":"http://www.minnpost.com/politics-policy/2014/04/hennepin-county-commissioner-election-interview-anne-mavity","rowNumber":4},{"candidateid":"kelash","name":"Ken Kelash","profileurl":"http://www.minnpost.com/politics-policy/2014/04/hennepin-county-commissioner-election-interview-ken-kelash","rowNumber":5},{"candidateid":"schweigert","name":"Ben Schweigert","profileurl":"http://www.minnpost.com/politics-policy/2014/04/hennepin-county-commissioner-election-interview-ben-schweigert","rowNumber":6}]}}';});

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
          .set('answer', (answer === 'C') ? null : answer);
      });

      // Clear all answers
      this.applicationView.on('clearQuestions', function(e) {
        thisApp.questions.each(function(q, qi) {
          q.set('answer', null);
        });
      });

      // When answers change, rebuild candidate elimination
      this.questions.on('change:answer', function(model) {
        // Firgure out state of question
        model.set('state', (!model.get('answer')) ? 'unanswered' : 'answered');
        // Figure out what candidates are eliminated
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
