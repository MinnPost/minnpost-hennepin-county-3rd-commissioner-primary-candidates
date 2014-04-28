/**
 * RequireJS config which maps out where files are and shims
 * any non-compliant libraries.
 */
require.config({
  shim: {
  },
  baseUrl: 'js',
  paths: {
    'requirejs': '../bower_components/requirejs/require',
    'almond': '../bower_components/almond/almond',
    'text': '../bower_components/text/text',
    'jquery': '../bower_components/jquery/dist/jquery',
    'underscore': '../bower_components/underscore/underscore',
    'backbone': '../bower_components/backbone/backbone',
    'ractive': '../bower_components/ractive/index',
    'ractive-backbone': '../bower_components/ractive-backbone/ractive-adaptors-backbone',
    'ractive-events-tap': '../bower_components/ractive-events-tap/ractive-events-tap',
    'mpConfig': '../bower_components/minnpost-styles/dist/minnpost-styles.config',
    'mpFormatters': '../bower_components/minnpost-styles/dist/minnpost-styles.formatters',
    'mpNav': '../bower_components/minnpost-styles/dist/minnpost-styles.nav',
    'minnpost-hennepin-county-3rd-commissioner-primary-candidates': 'app'
  }
});
