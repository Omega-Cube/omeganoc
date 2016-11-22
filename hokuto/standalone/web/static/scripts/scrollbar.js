"use strict"

// Main scrollbar starter script
// To add a scrollbar to an element, add the data-scrollbar attribute
// The attribute contains the height compensation : the viewport's height will
// be computed to be the containing element height minus the compensation height
define(['jquery', 
        'onoc.loadcss', 
        'onoc.createurl', 
        'libs/jquery.scrollbar'], function ($, loadCss, createurl) {
    var _firstInit = false;
    var _scrollbars = []; // List of all currently active scrollbars

    function createScrollbar(jqContainer, compensate) {
        compensate = compensate || 0;

        _doFirstInit();

        jqContainer.data('scrollbar-compensateHeight', compensate);
        jqContainer.tinyscrollbar();

        jqContainer.on('updatescrollbar.onoc', function (e) {
            e.stopPropagation(); // Do not propagate to the root, so only this scrollbar gets updated
            _updateContainerHeight($(this));
        });

        _scrollbars.push(jqContainer);

        _updateContainerHeight(jqContainer);
    }

    function _updateContainerHeight(root) {
        /*
        var scrollbars = null;

        if (!root) {
            scrollbars = $('[data-scrollbar]');
        }
        else if ($(root).data('scrollbar')) {
            scrollbars = $(root);
        }
        else {
            scrollbars = $('[data-scrollbar]', root);
        }

        scrollbars.each(function () {
            var that = $(this);
            var compensateHeight = that.data('scrollbar-compensateHeight');
            var height = that.parent().height();
            $("> .viewport", this).css("height", height - compensateHeight);
        });

        scrollbars.tinyscrollbar_update('relative');
        */

        var scrollbars;
        if (root)
            scrollbars = [root];
        else
            scrollbars = _scrollbars;

        for (var i = 0; i < scrollbars.length; ++i) {
            var e = scrollbars[i];
            var compensateHeight = e.data('scrollbar-compensateHeight');
            var height = e.parent().height();

            e.find('> .viewport').css('height', (height - compensateHeight) + 'px');
            e.tinyscrollbar_update('relative');
        }
    }

    function _doFirstInit() {
        if (!_firstInit) {
            _firstInit = true;

            loadCss(createurl('static/css/scroll_bar.css'));

            $(window).resize(function () {
                _updateContainerHeight();
            });

            $(document).on('updatescrollbar.onoc', function () {
                _updateContainerHeight();
            });
        }
    }

    $(document).ready(function () {

        var scrollbar = $('[data-scrollbar]');
        if (scrollbar.length > 0) {
            /*
            scrollbar.each(function () {
                var that = $(this);
                var compensateHeight = parseInt(that.data('scrollbar'), 10);
                if (isNaN(compensateHeight))
                    compensateHeight = 0;
                that.data('scrollbar-compensateHeight', compensateHeight);
            });

            scrollbar.tinyscrollbar();

            $(window).resize(function () {
                _updateContainerHeight();
            });

            scrollbar.on('updatescrollbar.onoc', function (e) {
                e.stopPropagation(); // Do not propagate to the root, so only this scrollbar gets updated
                _updateContainerHeight(this);
            });

            $(document).on('updatescrollbar.onoc', function () {
                _updateContainerHeight();
            });

            _updateContainerHeight();
            */
            scrollbar.each(function () {
                var that = $(this);
                var compensateHeight = parseInt(that.data('scrollbar'), 10);
                if (isNaN(compensateHeight))
                    compensateHeight = 0;
                createScrollbar(that, compensateHeight);
            });
        }
    });

    return createScrollbar;
});
