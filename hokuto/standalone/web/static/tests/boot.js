/*
 * This file is part of Omega Noc
 * Copyright Omega Noc (C) 2016 Omega Cube and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
'use strict';

// Custom Jasmine boot script
// The module's export is a function that starts the tests when called
define(['jasmine', 'jasmine-html'], function() {
    // The 'jasmine' and 'jasmine-html' modules are legacy modules that will create their
    // tools in the global namespace
    /* global jasmineRequire */

    /**
     * ## Require &amp; Instantiate
     *
     * Require Jasmine's core files. Specifically, this requires and attaches all of Jasmine's code to the `jasmine` reference.
     */
    var jasmine = jasmineRequire.core(jasmineRequire);

    /**
     * Since this is being run in a browser and the results should populate to an HTML page, require the HTML-specific Jasmine code, injecting the same reference.
     */
    jasmineRequire.html(jasmine);

    /**
     * Create the Jasmine environment. This is used to run all specs in a project.
     */
    var env = jasmine.getEnv();

    /**
     * ## The Global Interface
     *
     * Build up the functions that will be exposed as the Jasmine public interface. A project can customize, rename or alias any of these functions as desired, provided the implementation remains unchanged.
     */
    var jasmineInterface = jasmineRequire.interface(jasmine, env);

    /**
     * Add all of the Jasmine global/public interface to the global scope, so a project can use the public interface directly. For example, calling `describe` in specs instead of `jasmine.getEnv().describe`.
     */
    extend(window, jasmineInterface);

    /**
     * ## Runner Parameters
     *
     * More browser specific code - wrap the query string in an object and to allow for getting/setting parameters from the runner user interface.
     */

    var queryString = new jasmine.QueryString({
        getWindowLocation: function() { return window.location; }
    });

    var catchingExceptions = queryString.getParam('catch');
    env.catchExceptions(typeof catchingExceptions === 'undefined' ? true : catchingExceptions);

    var throwingExpectationFailures = queryString.getParam('throwFailures');
    env.throwOnExpectationFailure(throwingExpectationFailures);

    var random = queryString.getParam('random');
    env.randomizeTests(random);

    var seed = queryString.getParam('seed');
    if (seed) {
        env.seed(seed);
    }

    /**
     * ## Reporters
     * The `HtmlReporter` builds all of the HTML UI for the runner page. This reporter paints the dots, stars, and x's for specs, as well as all spec names and all failures (if any).
     */
    var htmlReporter = new jasmine.HtmlReporter({
        env: env,
        onRaiseExceptionsClick: function() { queryString.navigateWithNewParam('catch', !env.catchingExceptions()); },
        onThrowExpectationsClick: function() { queryString.navigateWithNewParam('throwFailures', !env.throwingExpectationFailures()); },
        onRandomClick: function() { queryString.navigateWithNewParam('random', !env.randomTests()); },
        addToExistingQueryString: function(key, value) { return queryString.fullStringWithNewParam(key, value); },
        getContainer: function() { return document.body; },
        createElement: function() { return document.createElement.apply(document, arguments); },
        createTextNode: function() { return document.createTextNode.apply(document, arguments); },
        timer: new jasmine.Timer()
    });

    /**
     * The `jsApiReporter` also receives spec results, and is used by any environment that needs to extract the results  from JavaScript.
     */
    env.addReporter(jasmineInterface.jsApiReporter);
    env.addReporter(htmlReporter);

    /**
     * Filter which specs will be run by matching the start of the full name against the `spec` query param.
     */
    var specFilter = new jasmine.HtmlSpecFilter({
        filterString: function() { return queryString.getParam('spec'); }
    });

    env.specFilter = function(spec) {
        return specFilter.matches(spec.getFullName());
    };

    /**
     * Setting up timing functions to be able to be overridden. Certain browsers (Safari, IE 8, phantomjs) require this hack.
     */
    window.setTimeout = window.setTimeout;
    window.setInterval = window.setInterval;
    window.clearTimeout = window.clearTimeout;
    window.clearInterval = window.clearInterval;

    /**
     * ## Execution
     *
     * This RequireJS module will return the startup function
     */
    var startup = function() {
        htmlReporter.initialize();
        env.execute();
    };

    /**
     * Helper function for readability above.
     */
    function extend(destination, source) {
        for (var property in source) 
            destination[property] = source[property];
        return destination;
    }

    return startup;
});