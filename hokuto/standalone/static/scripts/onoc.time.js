/*
 * This file is part of Omega Noc
 * Copyright Omega Noc (C) 2014 Omega Cube and contributors
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
     * Display a time picker
     * @class
     */
    var onocTimePicker = function(callback){
        this.callback = callback;

        this.input = false;
        this.active = false;

        this.container = $('<section class="onoc-time-picker"></section>');
        this.hourSelect = $('<select name="onoc-time-picker-hour" size="1"></select>');
        this.minuteSelect = $('<select name="onoc-time-picker-minute" size="1"></select>');

        for(var i = 0, len = 24; i<len; i++)
            this.hourSelect.append($('<option value="'+i+'">'+((i > 9) ? i:'0'+i)+'</option>'));
        for(var minutes = [], i = 0, len = 60; i<len; i+= 5)
            this.minuteSelect.append($('<option value="'+i+'">'+((i > 9) ? i:'0'+i)+'</option>'));

        var choose = $('<button class="choose">Ok</button>');
        choose.on('click', this.choose.bind(this));
        var close = $('<button class="close"></button>');
        close.on('click', this.close.bind(this));

        this.container.append(this.hourSelect);
        this.container.append(this.minuteSelect);
        this.container.append(choose);
        this.container.append(close);
    };

    /**
     * Display the form
     */
    onocTimePicker.prototype.display = function(e){
        this.container.attr('style','left:'+this.input[0].offsetLeft+'px;');

        if(this.input.data('time')){
            var current = new Date(this.input.data('time'));
            this.hourSelect[0].value = current.getHours();
            this.minuteSelect[0].value = current.getMinutes() - current.getMinutes() % 5;

        }
        this.input.parent().append(this.container);
    };

    /**
     * Close the form
     */
    onocTimePicker.prototype.close = function(e){
        this.container.detach();
    };

    /**
     *
     */
    onocTimePicker.prototype.choose = function(){
        var hour, min;
        hour = Number(this.hourSelect[0].value);
        min = Number(this.minuteSelect[0].value);

        //Filled on domain update, see dashboard.widgets
        //this.fillInput(hour,min);
        this.callback(hour * 3600 * 1000 + min * 60 * 1000);
        this.close(false);
    };

    /**
     * Bind to an input
     */
    onocTimePicker.prototype.bind = function(input){
        input.on('focusin',this.display.bind(this));
        input.attr('readonly','readonly');
        this.input = input;
        this.clear();
    };

    /**
     *
     */
    onocTimePicker.prototype.clear = function(){
        this.input.attr('value','00:00');
    };

    /**
     *
     */
    onocTimePicker.prototype.fillInput = function(hour,min){
        var hour = (hour > 9) ? hour.toString():'0'+hour;
        var min = (min > 9) ? min.toString():'0'+min;
        this.input.attr('value',hour + ':' + min);
    };

    return onocTimePicker;
});
