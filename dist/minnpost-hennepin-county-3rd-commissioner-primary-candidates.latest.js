
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
    model: models.Candidate,

    comparator: 'last'
  });

  // Categories
  collections.Categories = collections.Base.extend({
    model: models.Category
  });

  // Return what we have
  return collections;
});


define('text!templates/application.mustache',[],function () { return '<div class="application-container">\n  <div class="message-container"></div>\n\n  <div class="content-container">\n\n    <div class="navigation horizontal top-container">\n      <div class="candidate-list">\n        {{#candidates}}\n          <div class="candidate {{#eliminated}}eliminated{{/eliminated}} inline-block">\n            <img class="rounded" src="{{ options.paths.images }}{{ candidateid }}.jpg">\n            <div class="candidate-name small">\n              {{#profileurl}}\n                <a href="{{ profileurl }}" target="_blank">{{ name }}</a>\n              {{/profileurl}}\n              {{^profileurl}}{{ name }}{{/profileurl}}\n            </div>\n          </div>\n        {{/candidates}}\n      </div>\n\n      <div class="one-left">\n        {{#(candidatesLeft.length === 1)}}\n          {{#candidatesLeft.0}}\n            It looks like <strong>{{ name }}</strong> is your best fit.\n              {{#profileurl}}\n                <a href="{{ profileurl }}" target="_blank">Learn more</a> about this candidate.\n              {{/profileurl}}\n              <a href="#" on-tap="clearQuestions" class="">Start over</a>.\n            {{/candidatesLeft.0}}\n        {{/()}}\n        {{#(typeof candidatesLeft.length != \'undefined\' && candidatesLeft.length === 0)}}\n          Somehow you filtered everyone out!  <a href="#" on-tap="clearQuestions" class="">Start over</a>.\n        {{/()}}\n      </div>\n    </div>\n\n    <div class="spacer"></div>\n\n    <div class="category-list hide">\n      {{#categories}}\n        <button class="button xsmall category">\n          {{ category }}\n        </button>\n      {{/categories}}\n    </div>\n\n    <p class="instructions caption">Answer the questions below to filter out candidates.  If a question goes dim, then that means answering it or changing that answer would not help filter more candidates, or it would lead to all candidates being filtered out.  If you want to start over, use this link to <a href="#" on-tap="clearQuestions" class="">clear all the answers</a>.</p>\n\n\n    <div class="question-list">\n      {{#questions}}\n        <div class="question {{ state }}">\n          <div class="question-text large">{{ question }}</div>\n\n          <div class="question-options">\n            <button\n              on-tap="answer:[\'Y\', {{ questionid }}]"\n              class="button small\n                {{#(answer !== \'Y\')}}info{{/()}}\n                {{#(answer === \'Y\')}}active primary{{/()}}"\n            >Yes</button>\n\n            <button\n              on-tap="answer:[\'N\', {{ questionid }}]"\n              class="button small\n                {{#(answer !== \'N\')}}info{{/()}}\n                {{#(answer === \'N\')}}active primary{{/()}}"\n            >No</button>\n\n            <button\n              on-tap="answer:[\'S\', {{ questionid }}]"\n              class="button small\n                {{#(answer !== \'S\')}}button-link{{/()}}\n                {{#(answer === \'S\')}}active primary{{/()}}"\n            >Skip</button>\n\n          </div>\n        </div>\n      {{/questions}}\n    </div>\n\n\n\n  </div>\n\n  <div class="footnote-container">\n    <div class="footnote">\n      <p>Some code, techniques, and data on <a href="https://github.com/minnpost/minnpost-hennepin-county-3rd-commissioner-primary-candidates" target="_blank">Github</a>.</p>\n\n        <p>Some map data © OpenStreetMap contributors; licensed under the <a href="http://www.openstreetmap.org/copyright" target="_blank">Open Data Commons Open Database License</a>.  Some map design © MapBox; licensed according to the <a href="http://mapbox.com/tos/" target="_blank">MapBox Terms of Service</a>.  Location geocoding provided by <a href="http://www.mapquest.com/" target="_blank">Mapquest</a> and is not guaranteed to be accurate.</p>\n\n    </div>\n  </div>\n</div>\n';});


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


define('text!../data/preferences.json',[],function () { return '{"Candidate guide to Hennepin County 3rd Commissioner Primary":{"Questions":[{"category":"Partisanship","question":"Do you want a candidate who sought DFL endorsement?","eliminatesony":"carney, reuer","eliminatesonn":"greene, mavity, kelash, schweigert","unknownstance":"","na":"","rowNumber":1},{"category":"Endorsements","question":"Do you want a candidate endorsed by the GOP?","eliminatesony":"greene, mavity, kelash, schweigert, reuer","eliminatesonn":"carney","unknownstance":"","na":"","rowNumber":2},{"category":"Endorsements","question":"Do you want a candidate endorsed by all members of the St. Louis Park City Council and State Rep. Ryan Winkler and State Sen. Ron Latz?","eliminatesony":"greene, carney, reuer, kelash, schweigert","eliminatesonn":"mavity","unknownstance":"","na":"","rowNumber":3},{"category":"Endorsements","question":"Do you want a candidate endorsed by Stonewall DFL, Hennepin Commissioner Linda Higgins, State Rep. Frank Hornstein, School board members Mammen, Monserrate and Gagnon?","eliminatesony":"mavity, carney, reuer, kelash, schweigert","eliminatesonn":"greene","unknownstance":"","na":"","rowNumber":4},{"category":"Endorsements","question":"Do you want a candidate endorsed by former NRP director Bob Miller, State Rep. Joe Mullery and Minneapolis Parks Commissioner Jon Olson? ","eliminatesony":"mavity, carney, reuer, schweigert, greene","eliminatesonn":"kelash","unknownstance":"","na":"","rowNumber":5},{"category":"Endorsements","question":"Do you want a candidate endorsed by County Attoney Mike Freeman and State Reps. Karen Clark & Susan Allen?","eliminatesony":"mavity, greene, carney, reuer, kelash","eliminatesonn":"schweigert","unknownstance":"","na":"","rowNumber":6},{"category":"Union support","question":"Do you want a candidate with union support?","eliminatesony":"greene, carney, reuer","eliminatesonn":"mavity, kelash, schweigert","unknownstance":"","na":"","rowNumber":7},{"category":"Union support","question":"Do you want a candidate supported by AFSCME, Teamsters, and Hennepin County Sheriff’s Deputies?","eliminatesony":"mavity, greene, carney, reuer, kelash","eliminatesonn":"schweigert","unknownstance":"","na":"","rowNumber":8},{"category":"Union support","question":"Do you want a candidate supported by the Carpenters, Building Trades, Laborers, and Locomotive Workers?","eliminatesony":"mavity, greene, carney, reuer, schweigert","eliminatesonn":"kelash","unknownstance":"","na":"","rowNumber":9},{"category":"Union support","question":"Do you want a candidate supported by the Sheet Metal Workers?","eliminatesony":"greene, carney, reuer, kelash, schweigert","eliminatesonn":"mavity","unknownstance":"","na":"","rowNumber":10},{"category":"Elected experience","question":"Do you want a candidate with previous elected experience?","eliminatesony":"carney, reuer, schweigert","eliminatesonn":"greene, kelash, mavity","unknownstance":"","na":"","rowNumber":11},{"category":"Southwest LRT","question":"Do you want a candidate who would replace Southwest LRT with busways?","eliminatesony":"greene, mavity, kelash, schweigert, reuer","eliminatesonn":"carney","unknownstance":"","na":"","rowNumber":12},{"category":"Residence","question":"Do you want a candidate who lives in Minneapolis?","eliminatesony":"mavity","eliminatesonn":"greene, carney, reuer, kelash, schweigert","unknownstance":"","na":"","rowNumber":13},{"category":"Residence","question":"Do you want a candidate who lives in St. Louis Park?","eliminatesony":"greene, carney, reuer, kelash, schweigert","eliminatesonn":"mavity","unknownstance":"","na":"","rowNumber":14},{"category":"Minneapolis mayoral election","question":"Do you want a candidate who endorsed Mark Andrew for 2013 Minneapolis mayor?","eliminatesony":"carney, reuer, schweigert, mavity","eliminatesonn":"greene, kelash","unknownstance":"","na":"","rowNumber":15},{"category":"Minneapolis mayoral election","question":"Do you want a candidate who voted Betsy Hodges first in the 2013 Minneapolis mayoral election?","eliminatesony":"mavity, greene, carney, reuer, kelash","eliminatesonn":"schweigert","unknownstance":"","na":"","rowNumber":16},{"category":"Minneapolis mayoral election","question":"Do you want a candidate who voted Cam Winton first in the 2013 Minneapolis mayoral election?","eliminatesony":"mavity, greene, carney, kelash, schweigert","eliminatesonn":"reuer","unknownstance":"","na":"","rowNumber":17},{"category":"Experience","question":"Do you want a candidate who served on the boards of OutFront Minnesota and Minnesotans United for All Families?","eliminatesony":"mavity, carney, reuer, kelash, schweigert","eliminatesonn":"greene","unknownstance":"","na":"","rowNumber":18},{"category":"Experience","question":"Do you want a candidate who served on the Hennepin County Workforce Board?","eliminatesony":"greene, carney, reuer, schweigert","eliminatesonn":"mavity, kelash","unknownstance":"","na":"","rowNumber":19},{"category":"Experience","question":"Do you want a candidate who has worked as a Hennepin County prosecutor?","eliminatesony":"mavity, greene, carney, reuer, kelash","eliminatesonn":"schweigert","unknownstance":"","na":"","rowNumber":20}],"Candidates":[{"candidateid":"carney","name":"Bob Carney Jr.","last":"Carney","profileurl":"http://www.minnpost.com/community-voices/2014/04/hennepin-commissioner-candidate-demand-southwest-lrt-alternatives","rowNumber":1},{"candidateid":"reuer","name":"Bob Reuer","last":"Reuer","profileurl":"","rowNumber":2},{"candidateid":"greene","name":"Marion Greene","last":"Greene","profileurl":"http://www.minnpost.com/politics-policy/2014/04/hennepin-county-commissioner-election-interview-marion-greene","rowNumber":3},{"candidateid":"mavity","name":"Anne Mavity","last":"Mavity","profileurl":"http://www.minnpost.com/politics-policy/2014/04/hennepin-county-commissioner-election-interview-anne-mavity","rowNumber":4},{"candidateid":"kelash","name":"Ken Kelash","last":"Kelash","profileurl":"http://www.minnpost.com/politics-policy/2014/04/hennepin-county-commissioner-election-interview-ken-kelash","rowNumber":5},{"candidateid":"schweigert","name":"Ben Schweigert","last":"Schweigert","profileurl":"http://www.minnpost.com/politics-policy/2014/04/hennepin-county-commissioner-election-interview-ben-schweigert","rowNumber":6}]}}';});

/**
 * Main application file for: minnpost-hennepin-county-3rd-commissioner-primary-candidates
 *
 * This pulls in all the parts
 * and creates the main object for the application.
 */

// Create main application
define('minnpost-hennepin-county-3rd-commissioner-primary-candidates', [
  'jquery', 'underscore', 'leaflet',
  'mpConfig', 'mpFormatters', 'mpMaps', 'mpNav',
  'helpers', 'models', 'collections', 'views',
  'text!../data/preferences.json'
], function(
  $, _, L, mpConfig, mpFormatters, mpMaps, mpNav,
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
          options: this.options,
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
        e.original.preventDefault();
        var answer = params[0];
        var qid = params[1];
        var question = thisApp.questions.get(qid);
        // check if unanswerable
        if (question.get('state') !== 'unanswerable') {
          question.set('answer', answer);
        }
      });

      // Clear all answers
      this.applicationView.on('clearQuestions', function(e) {
        e.original.preventDefault();
        thisApp.questions.setAll('answer', null);
        // Since any questions that haven't been answered will not get a
        // change event, we force this
        thisApp.questions.setAll('state', 'unanswered');
      });

      // When answers change, rebuild candidate elimination
      this.questions.on('change:answer', function(question, answer) {
        // Firgure out state of question
        question.set('state', (answer === null) ? 'unanswered' : 'answered');
        // Figure out what candidates and questions are eliminated
        thisApp.eliminateCandidates();
        thisApp.eliminateQuestions();
      });

      // Keep a list of candidates in the race
      this.candidates.on('change:eliminated', function(candidate, eliminated) {
        thisApp.applicationView.set('candidatesLeft', thisApp.candidates.where({ eliminated: false }));
      });
    },

    // Eliminate questions.  If a question will not affect the candidate
    // outcome, then there's no reason to show it.
    eliminateQuestions: function() {
      var eliminated = _.pluck(this.candidates.where({ eliminated: true }), 'id');
      var available = _.pluck(this.candidates.where({ eliminated: false }), 'id');

      // Reset any unanswerables
      this.questions.each(function(q, qi) {
        q.set('state', (q.get('state') === 'unanswerable') ? 'unanswered' : q.get('state'));
      });

      // If there is only one or less candidates then all questions are done
      if (this.candidates.length - eliminated.length <= 1) {
        this.questions.each(function(q, qi) {
          q.makeUnanswerable();
        });
      }
      else {
        // Determine if the candidates left could be split up by
        // a question.  So check if the available are either all or none
        // in a Y answer (TODO look further if there are unknown answers)
        this.questions.each(function(q, qi) {
          var diff = _.difference(available, q.get('eliminatesony'));
          if (q.get('state') !== 'answered' && (_.isEmpty(diff) || _.isEqual(diff, available))) {
            q.makeUnanswerable();
          }
        });
      }
    },

    // Candidate elimnation.  Go through each question and see
    // if one elimates a candidate.  It only needs to be elimnated once.
    eliminateCandidates: function() {
      var thisApp = this;

      // Reset
      this.candidates.setAll('eliminated', false);

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
          images: 'https://s3.amazonaws.com/data.minnpost/projects/minnpost-hennepin-county-3rd-commissioner-primary-candidates/images/',
          data: 'https://s3.amazonaws.com/data.minnpost/projects/minnpost-hennepin-county-3rd-commissioner-primary-candidates/data/'
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

