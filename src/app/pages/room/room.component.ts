import {
  AfterViewInit,
  Component,
  OnInit,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { LokiImplementation } from './loki-implementation';
import { VidyoConnector } from './vidyo-connector';
import { NgbModalConfig, NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { HttpClient, HttpHeaders } from '@angular/common/http';

declare var VidyoClientLib: any;

@Component({
  selector: 'app-room',
  templateUrl: './room.component.html',
  styleUrls: ['./room.component.less'],
})
export class RoomComponent
  extends VidyoConnector
  implements OnInit, AfterViewInit
{
  @ViewChild('nav') nav: any;
  @ViewChild('screen') screen: ElementRef;
  @ViewChild('canvas') canvas: ElementRef<any>;
  @ViewChild('downloadLink') downloadLink: ElementRef;

  VCLib = VidyoClientLib;
  selectedvalue: string = '';
  image: any = '';
  imageCaptured: boolean = false;
  imageVerify: boolean = false;
  imageScan: boolean = false;
  similar = 0;
  orginalImage: string = '';

  constructor(
    public router: Router,
    config: NgbModalConfig,
    private modalService: NgbModal,
    private httpClient: HttpClient
  ) {
    super();
    this.rtr = router;

    // create form control names - remove spaces and make the firt letter lowercase
    for (let label of this.sideBarFormLabels) {
      let tmp;
      tmp = label.replace(/\s/g, '');
      tmp = tmp[0].toLowerCase() + tmp.substring(1);
      this.controls.push(tmp);
    }
  }

  ngOnInit(): void {
    // create sidebar form
    this.chatForm = new FormGroup({
      chat: this.chat,
    });

    this.sideBarForm = new FormGroup({
      host: this.host,
      roomKey: this.roomKey,
      displayName: this.displayName,
      loggerUrl: this.loggerUrl,
      roomPin: this.roomPin,
      extData: this.extData,
      extDataType: this.extDataType,
      cameraShare: this.cameraShare,
      monitorShare: this.monitorShare,
      windowShare: this.windowShare,
    });

    this.bottomPanelCamera = new FormGroup({
      camera: this.camera,
    });

    this.bottomPanelMic = new FormGroup({
      mic: this.mic,
    });

    this.bottomPanelSpeaker = new FormGroup({
      speaker: this.speaker,
    });

    this.initVC();
  }

  ngAfterViewInit(): void {
    // this.nav.nativeElement.addEventListener('click', alert('lkjldkf'));
  }

  switchTab(active: number) {
    this.rightPaneExpanded = true;
    this.nav.select(active);
    // this.nav.activeId == active
    //   ? (this.rightPaneExpanded = true)
    //   : (this.rightPaneExpanded = false);
  }

  closerightPanel() {
    this.rightPaneExpanded = false;
    this.selectedvalue = '';
  }

  /**
   * Initialize VidyoClient
   */
  initVC() {
    let thisClass = this;
    // state has only READY state for now
    switch (this.state) {
      case 'READY': // The library is operating normally
        //   $("#connectionStatus").html("Ready to Connect");
        //   $("#helper").addClass("hidden");
        let VC = new this.VCLib.VidyoClient('', () => {
          // After the VidyoClient is successfully initialized a global VC object will become available
          // All of the VidyoConnector gui and logic is implemented in VidyoConnector.js
          // StartVidyoConnector(VC, VCUtils ? VCUtils.params.webrtc : 'true');
          this.setVC(VC);
          thisClass.initVidyoConnector();
        });
        break;
      case 'RETRYING': // The library operating is temporarily paused
        //   $("#connectionStatus").html("Temporarily unavailable retrying in " + status.nextTimeout / 1000 + " seconds");
        break;
      case 'FAILED': // The library operating has stopped
        //   ShowFailed(status);
        //   $("#connectionStatus").html("Failed: " + status.description);
        break;
      case 'FAILEDVERSION': // The library operating has stopped
        //   UpdateHelperPaths(status);
        //  ShowFailedVersion(status);
        //   $("#connectionStatus").html("Failed: " + status.description);
        break;
      case 'NOTAVAILABLE': // The library is not available
        //  UpdateHelperPaths(status);
        //  $("#connectionStatus").html(status.description);
        break;
    }
  }
  /**
   * Activate all listeners
   */
  initVidyoConnector(): void {
    if (this.state == 'READY') {
      this.vcStatus = 'Ready to Connect';
    } else {
      this.vcStatus = 'Connection problem detected';
    }
    let width =
      window.innerWidth ||
      document.documentElement.clientWidth ||
      document.body.clientWidth;
    let remoteParticipantsAmount = 1;

    let scope = this;

    this.getVC()
      .CreateVidyoConnector({
        viewId: 'renderer', // Div ID where the composited video will be rendered, see VidyoConnector.html;
        viewStyle: 'VIDYO_CONNECTORVIEWSTYLE_Default', // Visual style of the composited renderer
        remoteParticipants: remoteParticipantsAmount, // Maximum number of participants to render
        logFileFilter:
          'debug@VidyoClient debug@VidyoSDP debug@VidyoResourceManager all@VidyoSignaling',
        logFileName: '',
        userData: 0,
        constraints: {
          disableGoogleAnalytics: true,
        },
      })
      .then(function (vc: any) {
        // show vc version
        vc.GetVersion().then(
          (version: string) => (scope.vcVersion = version),
          () => (scope.vcVersion = 'GetVersion failed')
        );

        scope.vidyoConnector = vc;
        scope.parseUrlParameters();
        scope.registerDeviceListeners();
        // scope.registerModerationListeners(vidyoConnector);
        // scope.handleDeviceChange(vidyoConnector, scope.cameras, scope.microphones, scope.speakers); // custom handling
        // registerAdvancedSettingsListeners(vidyoConnector); // not needed
        // handleAdvancedSettingsChange(vidyoConnector); // not needed
        scope.statsSendingTool = new LokiImplementation().getLokiImplementation(
          scope.configParams.enableLoki,
          scope.configParams.lokiBaseUrl,
          scope.vidyoConnector
        );
        scope.handleParticipantChange();
        scope.handleReconnect();
        scope.handleSharing();
        scope.handleChat();

        if (
          scope.configParams &&
          scope.configParams.disableAudioLevelMonitor === 'true'
        ) {
          scope.vidyoConnector.SetAdvancedConfiguration({
            disableAudioEnergyMonitor: true,
          });
        }

        if (scope.configParams && scope.configParams.dynamicAudioSources) {
          scope.vidyoConnector.SetAdvancedConfiguration({
            dynamicAudioSources: scope.configParams.dynamicAudioSources,
          });
        }

        // If enableDebug is configured then enable debugging
        if (scope.configParams && scope.configParams.enableDebug === '1') {
          scope.vidyoConnector
            .EnableDebug({
              port: 7776,
              logFilter:
                'debug sent@VidyoClient enter@VidyoClient all@VidyoSignaling',
            })
            .then(function () {
              console.log('EnableDebug success');
            })
            .catch(function () {
              console.error('EnableDebug failed');
            });
        }

        // Join the conference if the autoJoin URL parameter was enabled
        if (scope.configParams && scope.configParams.autoJoin === '1') {
          scope.joinLeave();
        } else {
          // TODO: update current code or not implemented yet
          // Handle the join in the toolbar button being clicked by the end user.
          //     $("#joinLeaveButton").one("click", joinLeave);
        }

        if (scope.configParams && scope.configParams.enableAutoReconnect) {
          scope.vidyoConnector.SetAdvancedConfiguration({
            enableAutoReconnect: scope.configParams.enableAutoReconnect,
          });
        }

        if (scope.configParams && scope.configParams.maxReconnectAttempts) {
          scope.vidyoConnector.SetAdvancedConfiguration({
            maxReconnectAttempts: scope.configParams.maxReconnectAttempts,
          });
        }

        if (scope.configParams && scope.configParams.reconnectBackoff) {
          scope.vidyoConnector.SetAdvancedConfiguration({
            reconnectBackoff: scope.configParams.reconnectBackoff,
          });
        }

        if (
          scope.configParams &&
          scope.configParams.enableAudioOnlyMode === 'false'
        ) {
          scope.vidyoConnector.SetAdvancedConfiguration({
            enableAudioOnlyMode: false,
          });
        }

        // initWCtrlPanel(vidyoConnector); // not implemented
      })
      .catch(function (err: any) {
        console.error('CreateVidyoConnector Failed ' + err);
      });
  }
  onImageChange(event: any) {
    // console.log(event);

    this.selectedvalue = event.value;
    console.log(this.selectedvalue);
  }
  captureShot() {
    this.imageCaptured = true;
    let video: any = document.getElementsByTagName('video')[0];

    let canvas = document.createElement('canvas');

    canvas.width = 450;
    canvas.height = 300;

    // canvas.height = 350;
    // canvas.width = 250;
    let ctx = canvas.getContext('2d');
    ctx.drawImage(video, 400, 200, 500, 300, 0, 0, 500, 300);

    this.downloadLink.nativeElement.href = canvas.toDataURL('image/jpeg');
    this.downloadLink.nativeElement.download = 'citizenship.png';
    // this.downloadLink.nativeElement.click();

    // document.getElementById('output').appendChild(canvas);
    this.image = canvas.toDataURL('image/jpeg');
    this.orginalImage = canvas.toDataURL('image/jpeg');
  }

  dataURLtoBlob(dataurl) {
    var arr = dataurl.split(','),
      mime = arr[0].match(/:(.*?);/)[1],
      bstr = atob(arr[1]),
      n = bstr.length,
      u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: 'text/plain' });
  }

  DeleteImage() {
    this.imageVerify = false;
    this.selectedvalue = 'citizenship';
  }

  async onRecord() {
    const mediaDevices = navigator.mediaDevices as any;
    const stream = await mediaDevices.getDisplayMedia();
    console.log(stream);
  }
  open(content) {
    this.modalService.open(content);
    this.captureShot();
    this.selectedvalue = '';
  }
  imageRetake() {
    this.imageVerify = false;
    this.imageScan = false;
    this.similar = 0;
    this.selectedvalue = 'citizenship';
    this.modalService.dismissAll();
  }

  saveSidebar() {
    this.imageVerify = true;
    this.similar = 0;
    this.modalService.dismissAll();
  }
  verifyImage() {
    this.similar = 0; //initialiting Similar index
    console.log(this.orginalImage);
    const byteCharacters = atob(this.image.split(',')[1]);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/jpeg' });

    const formData = new FormData();
    formData.append('image', blob, 'image.jpeg');
    formData.append(
      'URL',
      'https://visafoto.com/img/docs/ps_passport_35x45mm.jpg'
    );

    this.imageScan = true;
    this.httpClient
      .post(
        'https://coe.digiconnect.com.np/ai/api/v1/face/verification-url?facial_landmarks=false',
        formData
      )
      .subscribe({
        next: (response: any) => (
          (this.similar = response.similarity_score),
          (this.imageScan = false),
          (this.orginalImage = response.original_image)
        ),
        error: (error: any) => (
          (this.similar = error), (this.imageScan = false)
        ),
      });
  }
}
