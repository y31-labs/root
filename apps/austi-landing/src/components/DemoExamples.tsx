import { Button } from '@workspace/ui/components/ui/button';

import type { DemoTab } from '../lib/demo-session';

type Props = {
  tab: DemoTab;
  approved: boolean;
  onApprove: () => void;
  onTab: (tab: DemoTab) => void;
};

export function DemoExamples({ tab, approved, onApprove, onTab }: Props) {
  return (
    <div className='demo-example'>
      <p className='demo-eyebrow'>Sample case · A-104 · Kitchen leak</p>
      {tab === 'Approvals' && (
        <>
          <h3>{approved ? 'You gave the go-ahead.' : 'Your policy. Your decision.'}</h3>
          <p>
            A plumber has proposed replacing the failed kitchen tap. The estimate is above this
            property’s approval limit.
          </p>
          <dl className='demo-facts'>
            <div>
              <dt>Property</dt>
              <dd>Oak House · Apartment 12</dd>
            </div>
            <div>
              <dt>Proposed work</dt>
              <dd>Replace tap and test for leaks</dd>
            </div>
            <div>
              <dt>Estimate</dt>
              <dd>€320 · parts and labour</dd>
            </div>
            <div>
              <dt>Approval limit</dt>
              <dd>€250</dd>
            </div>
            <div>
              <dt>Decision</dt>
              <dd className={approved ? 'demo-success' : ''}>
                {approved ? 'Approved in this walkthrough' : 'Waiting for property manager'}
              </dd>
            </div>
          </dl>
          <Button
            className='demo-button demo-primary'
            onClick={approved ? () => onTab('Contractors') : onApprove}
          >
            {approved ? 'View contractor plan' : 'Approve sample repair'}
            <span aria-hidden='true'>↗</span>
          </Button>
        </>
      )}
      {tab === 'Contractors' && (
        <>
          <h3>The right people, already in your network.</h3>
          <p>
            Austi prepares the brief and coordinates access with your approved contractors. This
            example shows the handoff after approval.
          </p>
          <dl className='demo-facts'>
            <div>
              <dt>Trade</dt>
              <dd>Plumbing</dd>
            </div>
            <div>
              <dt>First choice</dt>
              <dd>Property’s preferred plumber</dd>
            </div>
            <div>
              <dt>Backup</dt>
              <dd>Second approved plumber</dd>
            </div>
            <div>
              <dt>Resident access</dt>
              <dd>Proposed: tomorrow, 09:00–12:00</dd>
            </div>
            <div>
              <dt>Next step</dt>
              <dd>{approved ? 'Request availability · not sent' : 'Await manager approval'}</dd>
            </div>
          </dl>
          <Button
            className='demo-button'
            variant='outline'
            onClick={() => onTab(approved ? 'Case record' : 'Approvals')}
          >
            {approved ? 'See the case record' : 'Review approval'}
            <span aria-hidden='true'>↗</span>
          </Button>
        </>
      )}
      {tab === 'Case record' && (
        <>
          <h3>Every handoff stays with the case.</h3>
          <p>
            The report, decisions and next steps form one record for your existing property
            management system.
          </p>
          <ol className='demo-record'>
            <li>
              <span>01</span>
              <div>
                <strong>Report received</strong>
                <p>Resident reports a leaking kitchen tap.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Repair brief prepared</strong>
                <p>Photos, access details and plumber’s €320 estimate attached in this example.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>{approved ? 'Manager approved' : 'Approval requested'}</strong>
                <p>
                  {approved
                    ? 'Your walkthrough decision is recorded.'
                    : 'Estimate exceeds the €250 limit.'}
                </p>
              </div>
            </li>
            <li>
              <span>04</span>
              <div>
                <strong>Coordination pending</strong>
                <p>Availability, appointment and repair outcome still need confirmation.</p>
              </div>
            </li>
          </ol>
          <p className='demo-footnote'>
            PMS write-back depends on the integrations agreed during the alpha.
          </p>
        </>
      )}
      <p className='demo-example-note'>
        Interactive walkthrough · fictional data. No contractor is contacted and no money is spent.
      </p>
    </div>
  );
}
