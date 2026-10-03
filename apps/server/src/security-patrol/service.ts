import type {MailboxService} from "../mailbox-service.js";
import type {PatrolClient,PatrolNotice} from "./contracts.js";
interface PatrolDeliveryDatabase {
  findActiveHumanCommunityByResidentId(residentId:string):{home:{homeId:string}}|undefined;
  createCareerJobWake(input:{wakeId:string;residentId:string;letterId:string;message:string;createdAt:number}):unknown;
}
export class SecurityPatrolDeliveryService {
  readonly #database:PatrolDeliveryDatabase; readonly #mailbox:MailboxService; readonly #client:PatrolClient;
  readonly #bell:{notifyResident(residentId:string):void}; readonly #render:(notice:PatrolNotice)=>{title:string;body:string};
  readonly #pending=new Map<string,Promise<void>>();
  constructor(options:{database:PatrolDeliveryDatabase;mailbox:MailboxService;client:PatrolClient;
    bell:{notifyResident(residentId:string):void};render:(notice:PatrolNotice)=>{title:string;body:string}}) {
    this.#database=options.database;this.#mailbox=options.mailbox;this.#client=options.client;
    this.#bell=options.bell;this.#render=options.render;
  }
  sync(residentId:string):Promise<void> {
    const running=this.#pending.get(residentId);if(running) return running;
    const task=this.#deliver(residentId).finally(()=>this.#pending.delete(residentId));
    this.#pending.set(residentId,task);return task;
  }
  async #deliver(residentId:string):Promise<void> {
    if(!this.#database.findActiveHumanCommunityByResidentId(residentId)) return;
    const notices=await this.#client.pending(residentId);
    const community=this.#database.findActiveHumanCommunityByResidentId(residentId);
    if(!community) return;
    for(const notice of notices) {
      const copy=this.#render(notice);
      const letter=this.#mailbox.deliver({homeId:community.home.homeId,
        idempotencyKey:`security-patrol:${notice.notice_id}`,category:"system",...copy,sensitiveValues:[]});
      this.#database.createCareerJobWake({wakeId:`career-job:security-patrol:${notice.notice_id}`,
        residentId,letterId:letter.letterId,message:copy.body,createdAt:letter.createdAt});
      this.#bell.notifyResident(residentId);
      // Farm is acknowledged only after Main's durable letter and wake are both saved.
      await this.#client.acknowledge(residentId,[notice.notice_id]);
    }
  }
}
