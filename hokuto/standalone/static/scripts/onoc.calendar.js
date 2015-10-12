/*
 * This file is part of Omega Noc
 * Copyright Omega Noc (C) 2014 Omega Cube and contributors
 * Xavier Roger-Machart, xrm@omegacube.fr
 * Nicolas Lantoing, nicolas@omegacube.fr
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

define(['jquery'],function(jQuery){
    /**
     * Display a calendar date selector
     */
    var onocCalendar = function(container, callback, target){
        //data
        this.input = false;
        this.active = false;
        this.callback = false;

        //init with the current date
        this.selected = false;
        this.year = false;
        this.month = false;
        this.day = false;
        this.target = false;
        this.set(new Date());

        this.monthNames = [ "January", "February", "March", "April", "May", "June",
                            "July", "August", "September", "October", "November", "December" ];
        this.dayNames = ['Mo','Tu','We','Th','Fr','Sa','Su'];

        //containers
        this.container = $('<section class="onoc-date-picker"></section>');

        this.monthContainer = $('<div class="month"></div');
        this.monthContainer.append('<button class="prev"></button>');
        this.monthContainer.append('<button class="next"></button>');
        this.monthContainer.append('<span class="current"></span>');

        this.daysContainer = $('<div class="day"></div>');

        var close = $('<button class="close"></button>');

        //events
        this.monthContainer.on('click',this._monthSwitch.bind(this));
        this.daysContainer.on('click',this.choose.bind(this));
        close.on('click',this.close.bind(this));

        //append
        this.container.append(this.monthContainer);
        this.container.append(this.daysContainer);
        this.container.append(close);

        if(container)
            this.bind(container);
        if(callback)
            this.setCallback(callback);
        if(target)
            this.setTarget(target);
    };

    /**
     * Handle the month previous/next switch button, delegate the event
     */
    onocCalendar.prototype._monthSwitch = function(e){
        if(e.target.tagName !== 'BUTTON') return;
        if(e.target.className === 'prev')
            this._previousMonth();
        else if(e.target.className === 'next')
            this._nextMonth();
        return;
    };

    /**
     * Switch to previous month
     */
    onocCalendar.prototype._previousMonth = function(){
        if(--this.month < 0){
            this.month = 11;
            this.year--;
        }
        this.refresh();
    };

    /**
     * Switch to next month
     */
    onocCalendar.prototype._nextMonth = function(){
        if(++this.month > 11){
            this.month = 0;
            this.year++;
        }
        this.refresh();
    };

    /**
     * Build the month page (month + year title and days list)
     * use this._clean() before to flush previous datas
     */
    onocCalendar.prototype._buildMonthPage = function(){
        this.monthContainer.find('.current').append(this.monthNames[this.month]+' - '+this.year);

        var activeDate = new Date(this.year,this.month + 1, 0);
        var dayNumber = activeDate.getDate();
        var ol = $('<ol></ol>');
        var legend = $('<li class="legend"></li>')
        for(var d in this.dayNames){
            legend.append('<span>'+this.dayNames[d]+'</span>');
        }
        ol.append(legend);
        var week = $('<li class="week"></li>');
        activeDate.setDate(1);
        var day = activeDate.getDay();
        if(day === 0) day = 7;
        var counter = day;
        while(--day)
            week.append('<span class="blank"></span>');

        for(var i = 1;i<=dayNumber;i++, counter++){
            if(!((counter - 1) % 7)){
                ol.append(week);
                week = $('<li class="week"></li>');
            }
            week.append('<span data-day="'+i+'" '+
                      ((i=== this.day && this.month === this.selected.getMonth() && this.year === this.selected.getFullYear()) ?
                       'class="selected day"':'class="day"')+'>'
                      +((i < 10) ? '0'.concat(i):i)+'</span>');
        }
        ol.append(week);
        this.daysContainer.append(ol);
    };

    /**
     * Flush variable content, used before this._buildMonthPage
     */
    onocCalendar.prototype._clean = function(){
        this.container.find('.month .current').empty();
        this.container.find('.day').empty();
    };

    /**
     * Refresh the content with current data (this.year, this.month)
     */
    onocCalendar.prototype.refresh = function(){
        this._clean();
        this._buildMonthPage();
    };

    /**
     * Bind the calendar to an element
     */
    onocCalendar.prototype.bind = function(target){
        target.on('click', this.display.bind(this));
        this.input = target;
        this.input.attr('readonly','readonly');
        this.input.calendar = this;
    };

    /**
     * Display the calendar
     */
    onocCalendar.prototype.display = function(){
        this.refresh();
        //this.container.attr('style','left:'+this.input[0].offsetLeft+'px;');
        if(!this.target)
            this.input.parent().append(this.container);
        else
            this.target.append(this.container);
    };

    /**
     * Close the calendar
     */
    onocCalendar.prototype.close = function(){
        this.container.detach();
    };

    /**
     * Choose event
     */
    onocCalendar.prototype.choose = function(e){
        if(e.target.tagName !== 'SPAN') return;
        if(!e.target.getAttribute('data-day')) return;

        this.day = Number(e.target.getAttribute('data-day'));
        this.selected = new Date(this.year,this.month,this.day);
        this.input.attr('value',this.selected.toLocaleDateString());
        this.close();
        if(this.callback){
            this.callback(this.selected.getTime());
        }
    };

    /**
     * set the current date so we can bring the user
     * to the selected month and highlight the curent selected day
     */
    onocCalendar.prototype.set = function(date){
        this.selected = date;
        this.year = date.getFullYear();
        this.month = date.getMonth();
        this.day = date.getDate();
    };

    /**
     * Set the callback
     */
    onocCalendar.prototype.setCallback = function(callback){
        if(typeof callback !== 'function'){
            console.error("[Calendar] Callback must be a function");
            return false;
        }
        this.callback = callback;
        return this;
    };

    /**
     * Set the target
     */
    onocCalendar.prototype.setTarget = function(target){
        if(!target || typeof target.append === 'undefined'){
            console.error("[Calendar] missing target or wrong type.");
            return false;
        }
        this.target = target;
        return this;
    };

    return onocCalendar;
});
