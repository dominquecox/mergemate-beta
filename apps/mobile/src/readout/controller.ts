export type ReadoutState='stopped'|'playing'|'paused'|'unavailable'|'error';
export interface SpeechDriver {
  available():Promise<boolean>;
  speak(text:string,rate:number,done:()=>void,error:()=>void):void;
  stop():Promise<void>;
  pause?():Promise<void>;
  resume?():Promise<void>;
}
/** Single owner, sentence-bounded narration. The device adapter owns speech-engine delivery. */
export class ReadoutController {
  state:ReadoutState='stopped';rate=1;
  private sentences:string[]=[];private position=0;private generation=0;private nativePaused=false;private utterance=0;
  private queue=Promise.resolve();private listeners=new Set<()=>void>();
  constructor(private readonly driver:SpeechDriver){}
  subscribe(listener:()=>void){this.listeners.add(listener);return()=>{this.listeners.delete(listener);};}
  private emit(){for(const listener of this.listeners)listener();}
  private serial(action:()=>Promise<void>){const generation=this.generation;this.queue=this.queue.then(action,action).catch(()=>{if(generation===this.generation){this.state='error';this.emit();}});return this.queue;}
  async play(sentences:string[]){
    if(this.state==='playing')return;
    if(this.state==='paused')return this.resume();
    const generation=++this.generation;this.sentences=sentences.slice(0,80);this.position=0;this.state='playing';this.emit();
    await this.serial(async()=>{
      await this.driver.stop();if(generation!==this.generation)return;
      if(!this.sentences.length || !(await this.driver.available())){if(generation===this.generation){this.state='unavailable';this.emit();}return;}
      if(generation===this.generation)this.next(generation);
    });
  }
  private next(generation:number){
    if(generation!==this.generation || this.state!=='playing')return;
    const sentence=this.sentences[this.position];
    if(!sentence){this.state='stopped';this.position=0;this.emit();return;}
    const utterance=++this.utterance;
    try{this.driver.speak(sentence,this.rate,()=>{if(generation===this.generation && utterance===this.utterance){this.utterance++;this.position++;this.nativePaused=false;if(this.state==='playing')this.next(generation);}},()=>{if(generation===this.generation && utterance===this.utterance){this.utterance++;this.state='error';this.emit();}});}catch{this.state='error';this.emit();}
  }
  async pause(){
    if(this.state!=='playing')return;
    this.state='paused';this.emit();
    this.nativePaused=!!(this.driver.pause && this.driver.resume);
    if(this.nativePaused && this.driver.pause)return this.serial(()=>this.driver.pause!());
    ++this.generation;return this.serial(()=>this.driver.stop());
  }
  async resume(){
    if(this.state!=='paused')return;
    this.state='playing';this.emit();
    if(this.nativePaused && this.driver.resume){this.nativePaused=false;return this.serial(()=>this.driver.resume!());}
    const generation=++this.generation;return this.serial(async()=>{if(generation===this.generation)this.next(generation);});
  }
  async stop(){++this.generation;this.nativePaused=false;this.state='stopped';this.sentences=[];this.position=0;this.emit();return this.serial(()=>this.driver.stop());}
  async speed(rate:number){
    if(![0.75,1,1.25,1.5].includes(rate))return;
    this.rate=rate;this.emit();
    if(this.state==='playing' || this.state==='paused'){
      const playing=this.state==='playing';const generation=++this.generation;this.nativePaused=false;
      await this.serial(async()=>{await this.driver.stop();if(playing && generation===this.generation)this.next(generation);});
    }
  }
}
