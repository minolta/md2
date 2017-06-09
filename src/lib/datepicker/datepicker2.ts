import {
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Optional,
  Output,
  ViewChild,
  ViewContainerRef,
  ViewEncapsulation,
  NgZone,
  Self,
} from '@angular/core';
import {
  ControlValueAccessor,
  NgControl,
} from '@angular/forms';
import {
  coerceBooleanProperty,
  Overlay
} from '../core';
import { OverlayRef } from '../core/overlay/overlay-ref';
import { ComponentPortal } from '../core/portal/portal';
import { OverlayState } from '../core/overlay/overlay-state';
import { Dir } from '../core/rtl/dir';
import { PositionStrategy } from '../core/overlay/position/position-strategy';
import { RepositionScrollStrategy, ScrollDispatcher } from '../core/overlay/index';
import { Subscription } from 'rxjs/Subscription';
import { DateAdapter } from '../core/datetime/index';
import { ESCAPE } from '../core/keyboard/keycodes';
import { Md2Calendar } from './calendar';
import 'rxjs/add/operator/first';

/** Change event object emitted by Md2Select. */
export class Md2DateChange2 {
  constructor(public source: Md2Datepicker2<Date>, public value: Date) { }
}

/** Used to generate a unique ID for each datepicker instance. */
let datepickerUid = 0;


/**
 * Component used as the content for the datepicker dialog and popup. We use this instead of using
 * Md2Calendar directly as the content so we can control the initial focus. This also gives us a
 * place to put additional features of the popup that are not part of the calendar itself in the
 * future. (e.g. confirmation buttons).
 * @docs-private
 */
@Component({
  moduleId: module.id,
  selector: 'md2-datepicker-content',
  templateUrl: 'datepicker-content.html',
  styleUrls: ['datepicker-content.css'],
  host: {
    'class': 'md2-datepicker-content',
    '[class.md2-datepicker-content-touch]': 'datepicker.touchUi',
    '(keydown)': '_handleKeydown($event)',
  },
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Md2DatepickerContent<D> {
  datepicker: Md2Datepicker2<D>;

  @ViewChild(Md2Calendar) _calendar: Md2Calendar<D>;

  /**
   * Handles keydown event on datepicker content.
   * @param event The event.
   */
  _handleKeydown(event: KeyboardEvent): void {
    switch (event.keyCode) {
      case ESCAPE:
        this.datepicker.close();
        break;
      default:
        // Return so that we don't preventDefault on keys that are not explicitly handled.
        return;
    }

    event.preventDefault();
  }
}


// TODO(mmalerba): We use a component instead of a directive here so the user can use implicit
// template reference variables (e.g. #d vs #d="md2Datepicker"). We can change this to a directive if
// angular adds support for `exportAs: '$implicit'` on directives.
/** Component responsible for managing the datepicker popup/dialog. */
@Component({
  moduleId: module.id,
  selector: 'md2-datepicker2',
  templateUrl: 'datepicker2.html',
  styleUrls: ['datepicker.css'],
  host: {
    'role': 'datepicker',
    '[class.md2-datepicker-disabled]': 'disabled',
    '[class.md2-datepicker-opened]': 'opened',
    '[attr.aria-label]': 'placeholder',
    '[attr.aria-required]': 'required.toString()',
    '[attr.aria-disabled]': 'disabled.toString()',
    '[attr.aria-invalid]': '_control?.invalid || "false"',
  },
})
export class Md2Datepicker2<D> implements OnDestroy, ControlValueAccessor {

  _onChange = (value: any) => { };
  _onTouched = () => { };

  _inputFocused: boolean = false;

  /** The date to open the calendar to initially. */
  @Input() startAt: D;

  /** The view that the calendar should start in. */
  @Input() startView: 'month' | 'year' = 'month';

  /**
   * Whether the calendar UI is in touch mode. In touch mode the calendar opens in a dialog rather
   * than a popup and elements have more padding to allow for bigger touch targets.
   */
  @Input() touchUi = false;
  @Input() tabindex: number = 0;
  @Input() mode: 'auto' | 'portrait' | 'landscape' = 'auto';
  @Input() placeholder: string;
  @Input() timeInterval: number = 1;


  @Input()
  get type() { return this._type; }
  set type(value: 'date' | 'time' | 'datetime') {
    this._type = value || 'date';
    this._inputValue = this._formatDate(this._value);
  }
  private _type: 'date' | 'time' | 'datetime' = 'date';

  @Input()
  get format() {
    return this._format || (this.type === 'date' ?
      'dd/MM/y' : this.type === 'time' ? 'HH:mm' : this.type === 'datetime' ?
        'dd/MM/y HH:mm' : 'dd/MM/y');
  }
  set format(value: string) {
    if (this._format !== value) {
      this._format = value;
      this._inputValue = this._formatDate(this._value);
    }
  }
  private _format: string;

  /** The minimum valid date. */
  @Input()
  get min(): D { return this._minDate; }
  set min(value: D) {
    this._minDate = value;
  }
  _minDate: D;

  /** The maximum valid date. */
  @Input()
  get max(): D { return this._maxDate; }
  set max(value: D) {
    this._maxDate = value;
  }
  _maxDate: D;

  @Input() set filter(filter: (date: D | null) => boolean) {
    this._dateFilter = filter;
  }
  _dateFilter: (date: D | null) => boolean;

  @Input()
  get required(): boolean { return this._required; }
  set required(value) { this._required = coerceBooleanProperty(value); }
  private _required: boolean = false;

  @Input()
  get disabled(): boolean { return this._disabled; }
  set disabled(value) { this._disabled = coerceBooleanProperty(value); }
  private _disabled: boolean = false;

  @Input()
  get value() { return this._value; }
  set value(value: D) {
    this._value = this.coerceDateProperty(value);
    this.startAt = this._value;
    setTimeout(() => {
      this._inputValue = this._formatDate(this._value);
    });
  }
  private _value: D;
  private _inputValue: string = '';

  @Input()
  get openOnFocus(): boolean { return this._openOnFocus; }
  set openOnFocus(value: boolean) { this._openOnFocus = coerceBooleanProperty(value); }
  private _openOnFocus: boolean;

  @Input()
  set isOpen(value: boolean) {
    if (value && !this.opened) { this.open(); }
  }

  /** Event emitted when the select has been opened. */
  @Output() onOpen: EventEmitter<void> = new EventEmitter<void>();

  /** Event emitted when the select has been closed. */
  @Output() onClose: EventEmitter<void> = new EventEmitter<void>();

  /** Event emitted when the selected date has been changed by the user. */
  @Output() change: EventEmitter<D> = new EventEmitter<D>();

  /** Emits new selected date when selected date changes. */
  @Output() selectedChanged = new EventEmitter<D>();

  /** Whether the calendar is open. */
  opened = false;

  /** The id for the datepicker calendar. */
  id = `md2-datepicker-${datepickerUid++}`;

  /** The currently selected date. */
  _selected: D = null;

  /** A reference to the overlay when the calendar is opened as a popup. */
  private _popupRef: OverlayRef;

  /** A reference to the overlay when the calendar is opened as a dialog. */
  private _dialogRef: OverlayRef;

  /** A portal containing the calendar for this datepicker. */
  private _calendarPortal: ComponentPortal<Md2DatepickerContent<D>>;

  private _inputSubscription: Subscription;

  constructor(private _element: ElementRef,
    private _overlay: Overlay,
    private _ngZone: NgZone,
    private _viewContainerRef: ViewContainerRef,
    private _scrollDispatcher: ScrollDispatcher,
    @Optional() private _dateAdapter: DateAdapter<D>,
    @Optional() private _dir: Dir,
    @Self() @Optional() public _control: NgControl) {
    if (!this._dateAdapter) {
      throw Error('DateAdapter');
    }
    if (this._control) {
      this._control.valueAccessor = this;
    }

  }

  ngOnDestroy() {
    this.close();
    if (this._popupRef) {
      this._popupRef.dispose();
    }
    if (this._dialogRef) {
      this._dialogRef.dispose();
    }
    if (this._inputSubscription) {
      this._inputSubscription.unsubscribe();
    }
  }

  writeValue(value: any): void {
    this.value = value;
  }

  registerOnChange(fn: (value: any) => void): void { this._onChange = fn; }

  registerOnTouched(fn: () => {}): void { this._onTouched = fn; }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  _handleFocus(event: Event) {
    this._inputFocused = true;
    if (!this.opened && this.openOnFocus) {
      this.open();
    }
  }

  _handleBlur(event: Event) {
    this._inputFocused = false;
    if (!this.opened) {
      this._onTouched();
    }
    let el: any = event.target;
    //let date: Date = this._util.parseDate(el.value, this.format);
    //if (!date) {
    //  date = this._util.parse(el.value, this.format);
    //}
    //if (date != null && date.getTime && !isNaN(date.getTime())) {
    //  let d: Date = new Date(this.value);
    //  if (this.type !== 'time') {
    //    d.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    //  }
    //  if (this.type !== 'date') {
    //    d.setHours(date.getHours(), date.getMinutes());
    //  }
    //  if (!this._util.isSameMinute(this.value, d)) {
    //    this.value = d;
    //    this._emitChangeEvent();
    //  }
    //} else {
    //  if (this.value) {
    //    this.value = null;
    //    this._emitChangeEvent();
    //  }
    //}
  }

  private coerceDateProperty(value: any): D {
    let v: D = null;
    if (value != null && value.getTime && !isNaN(value.getTime())) {
      v = value;
    } else {
      //if (value && this.type === 'time') {
      //  let t = value + '';
      //  v = this._dateAdapter.createDate(); new Date();
      //  v.setHours(parseInt(t.substring(0, 2)));
      //  v.setMinutes(parseInt(t.substring(3, 5)));
      //} else {
      //  let timestamp = Date.parse(value);
      //  v = isNaN(timestamp) ? null : new Date(timestamp);
      //}
    }
    return v;
  }

  /**
   * format date
   * @param date Date Object
   * @return string with formatted date
   */
  private _formatDate(date: D): string {
    if (!this.format || !date) { return ''; }

    let format = this.format;

    // Years
    if (format.indexOf('yy') > -1) {
      format = format.replace('yy', ('00' + this._dateAdapter.getYear(date)).slice(-2));
    } else if (format.indexOf('y') > -1) {
      format = format.replace('y', '' + this._dateAdapter.getYear(date));
    }

    // Days
    if (format.indexOf('dd') > -1) {
      format = format.replace('dd', ('0' + this._dateAdapter.getDate(date)).slice(-2));
    } else if (format.indexOf('d') > -1) {
      format = format.replace('d', '' + this._dateAdapter.getDate(date));
    }

    // Hours
    //if (/[aA]/.test(format)) {
    //  // 12-hour
    //  if (format.indexOf('HH') > -1) {
    //    format = format.replace('HH', ('0' + this._getHours12(date)).slice(-2));
    //  } else if (format.indexOf('H') > -1) {
    //    format = format.replace('H', '' + this._getHours12(date));
    //  }
    //  format = format.replace('A', ((this._dateAdapter.getHours(date) < 12) ? 'AM' : 'PM'))
    //    .replace('a', ((this._dateAdapter.getHours(date) < 12) ? 'am' : 'pm'));
    //} else {
    // 24-hour
    if (format.indexOf('HH') > -1) {
      format = format.replace('HH', ('0' + this._dateAdapter.getHours(date)).slice(-2));
    } else if (format.indexOf('H') > -1) {
      format = format.replace('H', '' + this._dateAdapter.getHours(date));
    }
    //}

    // Minutes
    if (format.indexOf('mm') > -1) {
      format = format.replace('mm', ('0' + this._dateAdapter.getMinutes(date)).slice(-2));
    } else if (format.indexOf('m') > -1) {
      format = format.replace('m', '' + this._dateAdapter.getMinutes(date));
    }

    // Seconds
    if (format.indexOf('ss') > -1) {
      format = format.replace('ss', ('0' + this._dateAdapter.getSeconds(date)).slice(-2));
    } else if (format.indexOf('s') > -1) {
      format = format.replace('s', '' + this._dateAdapter.getSeconds(date));
    }

    // Months
    if (format.indexOf('MMMM') > -1) {
      format = format.replace('MMMM', this._dateAdapter.getMonthNames('long')[this._dateAdapter.getMonth(date)]);
    } else if (format.indexOf('MMM') > -1) {
      format = format.replace('MMM', this._dateAdapter.getMonthNames('short')[this._dateAdapter.getMonth(date)]);
    } else if (format.indexOf('MM') > -1) {
      format = format.replace('MM', ('0' + (this._dateAdapter.getMonth(date) + 1)).slice(-2));
    } else if (format.indexOf('M') > -1) {
      format = format.replace('M', '' + (this._dateAdapter.getMonth(date) + 1));
    }

    return format;
  }

  /** Selects the given date and closes the currently open popup or dialog. */
  _selectAndClose(date: D): void {
    let oldValue = this._selected;
    this._selected = date;
    if (!this._dateAdapter.sameDate(oldValue, this._selected)) {
      this.value = date;
      this._emitChangeEvent();
    }
    this.close();
  }

  /** Emits an event when the user selects a date. */
  _emitChangeEvent(): void {
    this._onChange(this.value);
    this.change.emit(this.value);
  }

  /** Open the calendar. */
  open(): void {
    if (this.opened) { return; }

    if (!this._calendarPortal) {
      this._calendarPortal = new ComponentPortal(Md2DatepickerContent, this._viewContainerRef);
    }

    this.touchUi ? this._openAsDialog() : this._openAsPopup();
    this.opened = true;
  }

  /** Close the calendar. */
  close(): void {
    if (!this.opened) {
      return;
    }
    if (this._popupRef && this._popupRef.hasAttached()) {
      this._popupRef.detach();
    }
    if (this._dialogRef && this._dialogRef.hasAttached()) {
      this._dialogRef.detach();
    }
    if (this._calendarPortal && this._calendarPortal.isAttached) {
      this._calendarPortal.detach();
    }
    this.opened = false;
  }

  /** Open the calendar as a dialog. */
  private _openAsDialog(): void {
    if (!this._dialogRef) {
      this._createDialog();
    }

    if (!this._dialogRef.hasAttached()) {
      let componentRef: ComponentRef<Md2DatepickerContent<D>> =
        this._dialogRef.attach(this._calendarPortal);
      componentRef.instance.datepicker = this;
    }

    this._dialogRef.backdropClick().first().subscribe(() => this.close());
  }

  /** Open the calendar as a popup. */
  private _openAsPopup(): void {
    if (!this._popupRef) {
      this._createPopup();
    }

    if (!this._popupRef.hasAttached()) {
      let componentRef: ComponentRef<Md2DatepickerContent<D>> =
        this._popupRef.attach(this._calendarPortal);
      componentRef.instance.datepicker = this;

      // Update the position once the calendar has rendered.
      this._ngZone.onStable.first().subscribe(() => this._popupRef.updatePosition());
    }

    this._popupRef.backdropClick().first().subscribe(() => this.close());
  }

  /** Create the dialog. */
  private _createDialog(): void {
    const overlayState = new OverlayState();
    overlayState.positionStrategy = this._overlay.position().global()
      .centerHorizontally()
      .centerVertically();
    overlayState.hasBackdrop = true;
    overlayState.backdropClass = 'cdk-overlay-dark-backdrop';
    overlayState.direction = this._dir ? this._dir.value : 'ltr';
    this._dialogRef = this._overlay.create(overlayState);
  }

  /** Create the popup. */
  private _createPopup(): void {
    const overlayState = new OverlayState();
    overlayState.positionStrategy = this._createPopupPositionStrategy();
    overlayState.hasBackdrop = true;
    if (this.touchUi) {
      overlayState.backdropClass = 'cdk-overlay-dark-backdrop';
    } else {
      overlayState.backdropClass = 'cdk-overlay-transparent-backdrop';
    }
    overlayState.direction = this._dir ? this._dir.value : 'ltr';
    overlayState.scrollStrategy = new RepositionScrollStrategy(this._scrollDispatcher);

    this._popupRef = this._overlay.create(overlayState);
  }

  /** Create the popup PositionStrategy. */
  private _createPopupPositionStrategy(): PositionStrategy {
    return this._overlay.position()
      .connectedTo(this._element,
      { originX: 'start', originY: 'bottom' },
      { overlayX: 'start', overlayY: 'top' }
      )
      .withFallbackPosition(
      { originX: 'start', originY: 'top' },
      { overlayX: 'start', overlayY: 'bottom' }
      )
      .withFallbackPosition(
      { originX: 'end', originY: 'bottom' },
      { overlayX: 'end', overlayY: 'top' }
      )
      .withFallbackPosition(
      { originX: 'end', originY: 'top' },
      { overlayX: 'end', overlayY: 'bottom' }
      );
  }
}
